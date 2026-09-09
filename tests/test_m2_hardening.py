from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import crm_service as svc
from app.crm_models import Assignment, Contact, Followup, Task
from app.data_models import Customer, SalesOrder
from app.models import ActivityLog, Base, User, utcnow
from test_m1_integration import setup_m1  # noqa: F401
from test_m2 import follow_payload, make_customer
from m1_fixtures import sales


def test_closed_timestamp_and_void_are_audited_idempotently(db, client, accounts, sign_in):
    c = make_customer(db, accounts['S1'].id)
    sign_in('S1')
    p = follow_payload(next_action='明日联系', next_followup_at=(utcnow()+timedelta(days=1)).isoformat())
    f = client.post(f'/api/crm/customers/{c.id}/followups', json=p).json()
    opp = {'opportunity_name':'礼品项目', 'owner_user_id':str(accounts['S1'].id)}
    o = client.post(f'/api/crm/customers/{c.id}/opportunities', json=opp).json()
    assert o['closed_at'] is None
    opp['stage'] = 'won'
    url = f'/api/crm/customers/{c.id}/opportunities/{o["id"]}'
    closed = client.put(url, json=opp).json()
    assert closed['closed_at'] and closed['weighted_amount'] is None
    assert client.put(url, json=opp).json()['closed_at'] == closed['closed_at']
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 0
    url = f'/api/crm/customers/{c.id}/followups/{f["id"]}/void'
    assert client.post(url, json={'reason':'重复记录'}).status_code == 403
    sign_in('Admin')
    for _ in range(2):
        r = client.post(url, json={'reason':'重复记录'})
        assert r.status_code == 200 and not r.json()['is_active']
    assert db.scalar(select(Task)).status == 'cancelled'
    assert db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.activity_type == 'followup_void')) == 1
    sign_in('S1')
    assert client.put(f'/api/crm/customers/{c.id}/followups/{f["id"]}', json=p).status_code == 404


def test_edit_does_not_rewrite_finished_task_or_erase_erp_notes(db, client, accounts, sign_in):
    c = make_customer(db, accounts['S1'].id)
    sign_in('S1')
    p = follow_payload(next_action='跟进', next_followup_at=(utcnow()+timedelta(days=1)).isoformat())
    f = client.post(f'/api/crm/customers/{c.id}/followups', json=p).json()
    task = db.scalar(select(Task))
    new_due = utcnow()+timedelta(days=3)
    assert client.patch(f'/api/crm/tasks/{task.id}', json={'due_at':new_due.isoformat()}).status_code == 200
    assert client.patch(f'/api/crm/tasks/{task.id}', json={'status':'done'}).status_code == 200
    assert client.put(f'/api/crm/customers/{c.id}/followups/{f["id"]}', json={**p,'summary':'补充备注'}).status_code == 200
    db.refresh(task)
    assert task.due_at == new_due
    erp = Customer(source_system='fixture', customer_code='001', customer_name='ERP', normalized_name='ERP')
    db.add(erp)
    db.commit()
    sign_in('Admin')
    assert client.patch(f'/api/crm/customers/{erp.id}', json={'remark':'不可覆盖的备注'}).status_code == 200
    assert client.post(f'/api/crm/customers/{c.id}/bind', json={'target_id':str(erp.id)}).status_code == 409
    assert erp.remark == '不可覆盖的备注'


def test_bind_preserves_all_process_history_and_sales_scope(db, client, accounts, sign_in, setup_m1):  # noqa: F811
    _, upload, confirm = setup_m1
    assert confirm(upload('sales', sales())).status_code == 200
    target = db.scalar(select(Customer))
    target.owner_user_id = None
    target.ownership_status = 'unassigned'
    db.commit()
    original_order = db.scalar(select(SalesOrder))
    original_fact = svc.snapshot(original_order)
    c = make_customer(db, accounts['S1'].id, '绑定测试潜客')
    sign_in('S1')
    contact = client.post(f'/api/crm/customers/{c.id}/contacts', json={'name':'联系人'}).json()
    f = client.post(f'/api/crm/customers/{c.id}/followups', json=follow_payload(
        contact_id=contact['id'], next_action='绑定后联系', next_followup_at=utcnow().isoformat())).json()
    sign_in('Manager')
    bound = client.post(f'/api/crm/customers/{c.id}/bind', json={'target_id':str(target.id)})
    assert bound.status_code == 200
    assert db.get(Contact, UUID(contact['id'])).customer_id == target.id
    assert db.get(Followup, UUID(f['id'])).customer_id == target.id
    assert svc.snapshot(original_order) == original_fact
    sign_in('S1')
    result = client.get(f'/api/crm/customers/{target.id}').json()
    assert result['sales_summary']['total_amount'] == '0.30'
    assert result['sales_summary']['top_products'][0]['amount'] == '0.30'
    assert result['contacts'][0]['name'] == '联系人'
    assert {'followup_create','customer_bind'} <= {x['activity_type'] for x in result['events']}
    sign_in('Admin')
    assert client.post(f'/api/crm/customers/{target.id}/transfer', json={'owner_user_id':str(accounts['S2'].id),'reason':'转交'}).status_code == 200
    sign_in('S1')
    assert client.get(f'/api/crm/customers/{target.id}').status_code == 404
    sign_in('S2')
    result = client.get(f'/api/crm/customers/{target.id}').json()
    assert result['followups'] and result['tasks']
    assert result['orders'] == [] and result['sales_summary']['total_amount'] == '0.00'


def test_customer_history_and_list_pagination(db, client, accounts, sign_in):
    c = make_customer(db, accounts['S1'].id)
    for i in range(105):
        db.add(Followup(customer_id=c.id, owner_user_id=accounts['S1'].id, interaction_method='phone',
                        contact_result='normal', summary=str(i), occurred_at=utcnow()+timedelta(seconds=i)))
    db.commit()
    sign_in('S1')
    first = client.get(f'/api/crm/customers/{c.id}').json()
    second = client.get(f'/api/crm/customers/{c.id}?history_offset=50').json()
    last = client.get(f'/api/crm/customers/{c.id}?history_offset=100').json()
    assert first['has_more_history'] and second['has_more_history'] and not last['has_more_history']
    rows = first['followups']+second['followups']+last['followups']
    assert len({x['id'] for x in rows}) == 105
    assert len(client.get('/api/crm/followups?offset=100').json()) == 5


def test_concurrent_pool_claim_has_one_winner(database_engine):
    # Separate committed schema: genuine concurrent transactions, no production rows.
    schema = 'm2claim_' + uuid4().hex
    with database_engine.begin() as c:
        c.execute(text(f'CREATE SCHEMA "{schema}"'))
    isolated = database_engine.execution_options(schema_translate_map={None:schema})
    try:
        Base.metadata.create_all(isolated)
        with Session(isolated) as db:
            users = [User(username='claim'+str(i), display_name='测试',role_code='sales',password_hash='unused') for i in range(2)]
            cust = Customer(source_system='crm',customer_name='公海并发',normalized_name='公海并发',ownership_status='public_pool')
            db.add_all(users+[cust])
            db.commit()
            ids, cid = [x.id for x in users], cust.id
        barrier = Barrier(2)
        def claim(uid):
            with Session(isolated) as db:
                actor = db.get(User, uid)
                barrier.wait(timeout=10)
                try:
                    svc.transfer(db, actor, cid, None, claim=True)
                    return 200
                except HTTPException as exc:
                    return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(claim, ids)) == [200,409]
        with Session(isolated) as db:
            assert db.scalar(select(func.count()).select_from(Assignment)) == 1
    finally:
        with database_engine.begin() as c:
            c.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


@pytest.mark.parametrize('actor,expected', [('Owner',200),('Admin',200),('Manager',403),('S1',403),('S2',403),('Finance',403)])
def test_void_role_matrix(db,client,accounts,sign_in,actor,expected):
    c = make_customer(db, accounts['S1'].id)
    sign_in('S1')
    f = client.post(f'/api/crm/customers/{c.id}/followups', json=follow_payload()).json()
    sign_in(actor)
    assert client.post(f'/api/crm/customers/{c.id}/followups/{f["id"]}/void', json={'reason':'测试作废'}).status_code == expected


@pytest.mark.parametrize('environment,host', [('production','127.0.0.1'),('development','remote.invalid')])
def test_local_upgrade_rejects_nonlocal_or_production_before_connect(monkeypatch, tmp_path, environment, host):
    import importlib.util
    import sys
    from pathlib import Path
    path = Path(__file__).resolve().parents[1]/'scripts/upgrade_local_m2.py'
    spec = importlib.util.spec_from_file_location('m2_upgrade_test',path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module,'ROOT',tmp_path)
    monkeypatch.setenv('APP_ENV',environment)
    monkeypatch.setenv('DATABASE_URL',f'postgresql+psycopg://test@{host}/test')
    monkeypatch.setattr(sys,'argv',['upgrade','--pg-bin',str(tmp_path)])
    def forbidden(*args, **kwargs):
        pytest.fail('Unsafe upgrade reached database or process access')
    monkeypatch.setattr(module,'create_engine',forbidden)
    monkeypatch.setattr(module.subprocess,'run',forbidden)
    with pytest.raises(SystemExit,match='local development'):
        module.main()
