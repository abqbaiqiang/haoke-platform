from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app import crm_service as crm
from app.crm_models import Contact, CustomerClaim, Followup, Task
from app.data_models import Customer
from app.models import ActivityLog


def seed(db, accounts):
    rows = []
    for name in ['S1', 'S2']:
        c = Customer(source_system='crm', customer_name=name+'客户', normalized_name=name+'客户',
                     owner_user_id=accounts[name].id, ownership_status='owned')
        db.add(c)
        db.flush()
        db.add(Contact(customer_id=c.id, name=name+'采购', is_primary=True))
        rows.append(c)
    db.commit()
    return rows


def task(db, accounts, c, due, owner='S1'):
    t = Task(title='确认需求', customer_id=c.id, assignee_user_id=accounts[owner].id,
             created_by=accounts[owner].id, due_at=due, source_type='manual', task_type='followup')
    db.add(t)
    db.commit()
    return t


@pytest.mark.parametrize('actor,status', [('Owner',403),('Admin',403),('Manager',403),('Finance',403),('S1',200)])
def test_sales_only_presenter_roles(client, accounts, sign_in, actor, status):
    sign_in(actor)
    for path in ['customers','tasks','recent']:
        assert client.get('/api/sales/'+path).status_code == status


def test_customer_search_and_private_pool_data(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    sign_in('S1')
    response = client.get('/api/sales/customers?q=S1采购').json()
    assert response['total'] == 1
    assert response['rows'][0]['contact_name'] == 'S1采购'
    assert client.get('/api/sales/customers?q=S2采购').json()['total'] == 0
    other.ownership_status = 'public_pool'
    other.remark = 'private'
    db.commit()
    pool = client.get('/api/sales/customers?pool=true').json()['rows'][0]
    assert pool['remark'] is None and pool['contact_name'] is None
    assert client.get('/api/sales/customers?pool=true&q=S2采购').json()['total'] == 0


def test_task_counts_pagination_time_and_scope(db, client, accounts, sign_in, monkeypatch):
    mine, other = seed(db, accounts)
    now = datetime(2026,9,15,10,tzinfo=crm.TZ)
    monkeypatch.setattr('app.sales_workspace.utcnow', lambda: now)
    task(db, accounts, mine, now-timedelta(hours=1))
    task(db, accounts, mine, now+timedelta(hours=2))
    task(db, accounts, mine, now-timedelta(days=1))
    task(db, accounts, mine, now+timedelta(days=1))
    task(db, accounts, other, now, 'S2')
    sign_in('S1')
    data = client.get('/api/sales/tasks?limit=1').json()
    assert data['counts']['today'] == 2
    assert data['counts']['overdue'] == 2
    assert data['counts']['week'] == 1
    assert data['counts']['future'] == 1
    assert data['total'] == 2 and len(data['rows']) == 1
    assert data['rows'][0]['customer_name'] == 'S1客户'
    second = client.get('/api/sales/tasks?limit=1&offset=1').json()
    assert second['rows'][0]['id'] != data['rows'][0]['id']
    sign_in('S2')
    assert client.get('/api/sales/tasks').json()['total'] == 1


def test_followup_completion_next_step_atomic_and_repeat(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    now = datetime.now(crm.TZ)
    t = task(db, accounts, mine, now)
    sign_in('S1')
    body = {'complete_task_id':str(t.id), 'followup':{'interaction_method':'phone','contact_result':'normal',
            'summary':'需求已确认','next_action':'发送方案','next_followup_at':(now+timedelta(days=1)).isoformat()}}
    result = client.post(f'/api/sales/customers/{mine.id}/followup',json=body)
    assert result.status_code == 201, result.text
    db.refresh(t)
    assert t.status == 'done' and t.completed_at
    new = db.scalar(select(Task).where(Task.followup_id == result.json()['id']))
    assert new.title == '发送方案' and new.assignee_user_id == accounts['S1'].id
    assert db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.activity_type == 'task_complete')) == 1
    assert client.post(f'/api/sales/customers/{mine.id}/followup',json=body).status_code == 409
    assert db.scalar(select(func.count()).select_from(Followup)) == 1
    sign_in('S2')
    assert client.get('/api/sales/recent').json()['total'] == 0
    assert client.post(f'/api/sales/customers/{mine.id}/followup',json=body).status_code == 404


def test_foreign_task_or_invalid_contact_saves_nothing(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    now = datetime.now(crm.TZ)
    foreign = task(db, accounts, other, now, 'S2')
    own = task(db, accounts, mine, now)
    sign_in('S1')
    f = {'interaction_method':'phone','contact_result':'normal','summary':'不能保存'}
    assert client.post(f'/api/sales/customers/{mine.id}/followup',json={'followup':f,'complete_task_id':str(foreign.id)}).status_code == 404
    f['contact_id'] = str(db.scalar(select(Contact.id).where(Contact.customer_id == other.id)))
    assert client.post(f'/api/sales/customers/{mine.id}/followup',json={'followup':f,'complete_task_id':str(own.id)}).status_code == 422
    assert db.scalar(select(func.count()).select_from(Followup)) == 0
    db.refresh(own)
    assert own.status == 'todo'


def test_claimant_next_step_stays_with_actor_and_manual_task_allowed(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    db.add(CustomerClaim(customer_id=other.id,user_id=accounts['S1'].id))
    db.commit()
    sign_in('S1')
    f = {'interaction_method':'phone','contact_result':'normal','next_action':'我的下一步',
         'next_followup_at':datetime.now(crm.TZ).isoformat()}
    r = client.post(f'/api/sales/customers/{other.id}/followup',json={'followup':f})
    assert r.status_code == 201, r.text
    t = db.scalar(select(Task).where(Task.followup_id == r.json()['id']))
    assert t.assignee_user_id == accounts['S1'].id
    legacy = client.post(f'/api/crm/customers/{other.id}/followups', json=f)
    assert legacy.status_code == 201
    legacy_task = db.scalar(select(Task).where(Task.followup_id == legacy.json()['id']))
    assert legacy_task.assignee_user_id == accounts['S1'].id
    r = client.post('/api/crm/tasks',json={'title':'共同认养客户回访','assignee_user_id':str(accounts['S1'].id),
                                        'customer_id':str(other.id),'due_at':datetime.now(crm.TZ).isoformat()})
    assert r.status_code == 201, r.text


def test_no_next_step_requires_terminal_reason(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    sign_in('S1')
    f = {'interaction_method': 'phone', 'contact_result': 'normal', 'summary': '聊得不错'}
    assert client.post(f'/api/sales/customers/{mine.id}/followup', json={'followup': f}).status_code == 422
    f['contact_result'] = 'waiting'
    ok = client.post(f'/api/sales/customers/{mine.id}/followup', json={'followup': f})
    assert ok.status_code == 201, ok.text
    assert ok.json()['next_action'] is None


def test_effective_flag_saved_and_quotation_no_longer_rewrites_status(db, client, accounts, sign_in):
    """docs/32 §2：customer_status 字段已下线，报价留痕不再改写任何客户阶段字段。"""
    mine, other = seed(db, accounts)
    sign_in('S1')
    f = {'interaction_method': 'quote', 'contact_result': 'good', 'summary': '已发送报价', 'quotation_sent': True,
         'is_effective': True, 'next_action': '跟进报价', 'next_followup_at': datetime.now(crm.TZ).isoformat()}
    r = client.post(f'/api/sales/customers/{mine.id}/followup', json={'followup': f})
    assert r.status_code == 201, r.text
    assert r.json()['is_effective'] is True
    assert 'customer_status' not in r.json()
    f2 = {'interaction_method': 'phone', 'contact_result': 'no_answer', 'is_effective': False}
    r2 = client.post(f'/api/sales/customers/{mine.id}/followup', json={'followup': f2})
    assert r2.status_code == 201, r2.text
    assert r2.json()['is_effective'] is False


def test_sales_can_edit_company_address_but_not_retired_status(db, client, accounts, sign_in):
    """docs/32 §3：销售可维护公司地址；customer_status 字段整体拒绝。"""
    mine, other = seed(db, accounts)
    sign_in('S1')
    assert client.patch(f'/api/crm/customers/{mine.id}', json={'company_address': '济南市历下区XX路1号'}).status_code == 200
    assert client.get(f'/api/crm/customers/{mine.id}').json()['customer']['company_address'] == '济南市历下区XX路1号'
    r = client.patch(f'/api/crm/customers/{mine.id}', json={'customer_status': 'demand'})
    assert r.status_code == 422  # 字段已随 docs/32 §2 从 DTO 删除，直接被校验拒绝


def test_customer_list_returns_tags(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    sign_in('S1')
    tag = client.post('/api/crm/tags', json={'tag_name': '济南'}).json()
    client.put(f'/api/crm/customers/{mine.id}/tags', json={'tag_ids': [tag['id']]})
    rows = client.get('/api/sales/customers').json()['rows']
    row = next(r for r in rows if r['id'] == str(mine.id))
    assert row['tags'] == ['济南']
    assert all(r['tags'] == [] for r in rows if r['id'] != str(mine.id))


def test_process_metrics_count_followups_effective_quotes_and_deals(db, client, accounts, sign_in):
    mine, other = seed(db, accounts)
    now = datetime.now(crm.TZ)
    sign_in('S1')
    bodies = [
        {'interaction_method': 'phone', 'contact_result': 'good', 'is_effective': True,
         'next_action': '发方案', 'next_followup_at': (now + timedelta(days=1)).isoformat()},
        {'interaction_method': 'quote', 'contact_result': 'normal', 'quotation_sent': True, 'is_effective': True,
         'next_action': '等回复后跟进', 'next_followup_at': (now + timedelta(days=2)).isoformat()},
        {'interaction_method': 'phone', 'contact_result': 'no_answer', 'is_effective': False},
    ]
    cid = str(mine.id)
    for body in bodies[:2]:
        assert client.post(f'/api/sales/customers/{cid}/followup', json={'followup': body}).status_code == 201
    third = Customer(source_system='crm', customer_name='S1b客户', normalized_name='S1b客户',
                     owner_user_id=accounts['S1'].id, ownership_status='owned')
    db.add(third)
    db.commit()
    assert client.post(f'/api/sales/customers/{str(third.id)}/followup', json={'followup': bodies[2]}).status_code == 201
    month = now.strftime('%Y-%m')
    data = client.get(f'/api/bi/workbench/{accounts["S1"].id}?month={month}-01').json()
    values = {m['code']: m['value'] for m in data['metrics']}
    assert values['CRM_FOLLOWUP_CUSTOMERS'] == '2'
    assert values['CRM_FOLLOWUP_COUNT'] == '3'
    assert values['CRM_EFFECTIVE_FOLLOWUPS'] == '2'
    assert values['CRM_QUOTED_CUSTOMERS'] == '1'
    assert values['CRM_NEW_CUSTOMERS'] == '2'  # S1 只能看到自己名下本月新建的两家
    # 无已核实销售数据时成交客户不可用，给出原因而不是补零
    deal = next(m for m in data['metrics'] if m['code'] == 'CRM_DEAL_CUSTOMERS')
    assert deal['value'] is None and deal['reason']


def _perf_source(db, accounts, rows):
    """rows: list of (customer_of, order_date, amount) for S1."""
    from decimal import Decimal
    from app.data_models import DataSource, SalesOrder
    from app.data_models import ImportBatch
    src = DataSource(source_code='perf_src', source_name='业绩测试源', entity_name='业绩测试', is_enabled=True)
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, business_type='sales', original_filename='perf.csv',
                        storage_path='perf.csv', file_hash='0' * 64, status='success',
                        imported_by=accounts['S1'].id)
    db.add(batch)
    db.flush()
    c = Customer(source_system='perf_src', customer_code='P001', customer_name=' Perf客户 ', normalized_name='perf客户',
                 owner_user_id=accounts['S1'].id, ownership_status='owned')
    db.add(c)
    db.flush()
    for dt, amt in rows:
        db.add(SalesOrder(source_system='perf_src', order_no=f'P{dt:%Y%m%d}{amt}', order_date=dt,
                          customer_id=c.id, sales_user_id=accounts['S1'].id, sales_amount=Decimal(amt),
                          content_hash='0' * 64, last_import_batch_id=batch.id))
    db.commit()
    return src, c


def test_performance_role_gate_and_aggregates(db, client, accounts, sign_in):
    from datetime import datetime
    from app.crm_service import TZ
    now = datetime.now(TZ)
    src, c = _perf_source(db, accounts, [(now.date(), 8000), (now.date(), 5200), (now.date(), -1000)])
    sign_in('S1')
    r = client.get('/api/sales/performance', params={'source_id': str(src.id), 'from': '2026-09-01', 'to': '2026-09-01'})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['verified'] is True
    assert data['month_amount'] == '12200.00'
    assert data['target_amount'] is None and data['completion'] is None
    assert data['top_customers'][0]['name'] == 'Perf客户'
    assert data['top_customers'][0]['amount'] == '12200.00'
    assert data['structure']['new_deals'] == 1
    assert data['funnel'][0]['stage'] == '跟进客户'
    assert data['risks'] == [] or all(r['count'] >= 0 for r in data['risks'])
    sign_in('S2')
    other = client.get('/api/sales/performance', params={'source_id': str(src.id), 'from': '2026-09-01', 'to': '2026-09-01'})
    assert other.status_code == 404
    sign_in('Owner')
    assert client.get('/api/sales/performance', params={'source_id': str(src.id), 'from': '2026-09-01', 'to': '2026-09-01'}).status_code == 403


def bi_shift(d, days):
    return d - timedelta(days=-days if days < 0 else days)


def test_performance_last_year_yoy_gated_by_coverage(db, client, accounts, sign_in):
    from datetime import datetime, timedelta
    from app.crm_service import TZ
    now = datetime.now(TZ)
    ly = now - timedelta(days=365)
    # 覆盖单固定放在去年同期窗口之前：若相对 ly 偏移，当“今天”落在每月 17—30 日时会漂进去年同期同月窗口。
    coverage = (bi_shift(ly.date().replace(day=1), -16))
    src, c = _perf_source(db, accounts, [(now.date(), 8000), (ly.date(), 10000), (coverage, 500)])
    sign_in('S1')
    data = client.get('/api/sales/performance', params={'source_id': str(src.id), 'from': '2026-09-01', 'to': '2026-09-01'}).json()
    # 订单历史覆盖到去年同期（auto-accept 全历史），同比可用
    assert data['month_amount'] == '8000.00'
    assert data['last_year_amount'] == '10000.00'
    assert data['yoy'] == '-20.0'
    top = data['top_customers'][0]
    assert top['last_year'] == '10000.00' and top['yoy'] == '-20.0'
    # structure: 该客户去年同期已成交，本月复购 → 老客户
    assert data['structure']['repeat_customers'] == 1 and data['structure']['new_deals'] == 0


def test_opportunity_products_roundtrip_and_recent_list(db, client, accounts, sign_in):
    """商机可多选推荐产品：保存/更新/回读 + 工作台近期商机列表。"""
    from uuid import UUID
    from app.data_models import Product, ImportBatch, DataSource
    from app.crm_models import OpportunityProduct
    mine, other = seed(db, accounts)
    psrc = DataSource(source_code='opp_prod_src', source_name='商机产品测试源', entity_name='商机产品测试', is_enabled=True)
    db.add(psrc)
    db.flush()
    pbatch = ImportBatch(data_source_id=psrc.id, business_type='product', original_filename='p.csv',
                         storage_path='p.csv', file_hash='2' * 64, status='success', imported_by=accounts['S1'].id)
    db.add(pbatch)
    db.flush()
    p1 = Product(source_system='perf_src', product_code='P1', product_name='钛杯', last_import_batch_id=pbatch.id)
    p2 = Product(source_system='perf_src', product_code='P2', product_name='帐篷', last_import_batch_id=pbatch.id)
    p3 = Product(source_system='perf_src', product_code='P3', product_name='坐姿椅', last_import_batch_id=pbatch.id)
    db.add_all([p1, p2, p3])
    db.commit()
    sign_in('S1')
    body = {'opportunity_name': '春节礼盒', 'owner_user_id': str(accounts['S1'].id), 'stage': 'recommend',
            'estimated_amount': '5000.00', 'product_ids': [str(p1.id), str(p2.id)],
            'current_blocker': '等待客户确认预算', 'next_promotion': '9月17日发送3套8万元食品方案'}
    r = client.post(f'/api/crm/customers/{mine.id}/opportunities', json=body)
    assert r.status_code == 201, r.text
    view = r.json()
    assert view['current_blocker'] == '等待客户确认预算' and view['next_promotion'] == '9月17日发送3套8万元食品方案'
    assert [p['name'] for p in view['products']] == ['钛杯', '帐篷']
    assert db.scalar(select(func.count()).select_from(OpportunityProduct)) == 2
    # 更新为只剩一款；卡点清空（传 null）
    body['product_ids'] = [str(p3.id)]
    body['current_blocker'] = None
    r = client.put(f"/api/crm/customers/{mine.id}/opportunities/{view['id']}", json=body)
    assert r.status_code == 200, r.text
    assert [p['name'] for p in r.json()['products']] == ['坐姿椅']
    assert r.json()['current_blocker'] is None
    assert db.scalar(select(func.count()).select_from(OpportunityProduct)) == 1
    # 非法产品 id → 422
    body['product_ids'] = [str(UUID(int=999))]
    assert client.put(f"/api/crm/customers/{mine.id}/opportunities/{view['id']}", json=body).status_code == 422
    # 工作台近期商机列表（含客户名与产品）
    sign_in('S1')
    data = client.get('/api/sales/opportunities?days=30&limit=10').json()
    assert data['total'] == 1
    row = data['rows'][0]
    assert row['customer_name'] == 'S1客户' and row['stage'] == 'recommend'
    assert [p['name'] for p in row['products']] == ['坐姿椅']
    # 不带产品的历史调用不受影响
    r = client.post(f'/api/crm/customers/{mine.id}/opportunities',
                    json={'opportunity_name': '无产品商机', 'owner_user_id': str(accounts['S1'].id), 'stage': 'contact', 'next_promotion': '本周内发送方案'})
    assert r.status_code == 201 and r.json()['products'] == []
