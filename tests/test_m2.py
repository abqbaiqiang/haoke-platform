from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.crm_models import Assignment, Contact, Followup, Task
from app.crm_schemas import FollowupInput, OpportunityInput
from app.crm_service import task_window, weighted
from app.data_models import Customer
from app.models import ActivityLog, utcnow


def make_customer(db, owner, name='测试客户'):
    obj = Customer(source_system='crm', customer_name=name, normalized_name=name, owner_user_id=owner,
                   ownership_status='owned', crm_managed=True)
    db.add(obj)
    db.commit()
    return obj


def follow_payload(**kwargs):
    return {'interaction_method':'phone','contact_result':'good','summary':'确认预算', **kwargs}


def test_weighted_decimal_and_missing():
    assert weighted(Decimal('0.30'),Decimal('0.5')) == '0.15'
    assert weighted(Decimal('10.01'),Decimal('0.5')) == '5.01'
    assert weighted(None,Decimal('0.5')) is None
    assert weighted(Decimal('5'),None) is None


def test_shanghai_midnight_and_week():
    now = datetime(2026,9,6,16,0,tzinfo=timezone.utc)  # Monday midnight Shanghai
    start,end = task_window('today',now)
    assert start.isoformat() == '2026-09-07T00:00:00+08:00'
    assert (end-start).days == 1
    assert task_window('week',now)[1].isoformat() == '2026-09-14T00:00:00+08:00'
    assert task_window('overdue',now) == (None,now)


@pytest.mark.parametrize('probability', ['-0.1','1.01','NaN','0.12345'])
def test_invalid_probability(probability):
    with pytest.raises(ValidationError):
        OpportunityInput(opportunity_name='测试',owner_user_id=uuid4(), probability=probability)


def test_followup_requires_paired_aware_next_step():
    with pytest.raises(ValidationError):
        FollowupInput(**follow_payload(next_action='联系'))
    with pytest.raises(ValidationError):
        FollowupInput(**follow_payload(next_action='联系',next_followup_at='2026-09-10T10:00:00'))


@pytest.mark.parametrize('name,visible', [('Owner',True),('Admin',True),('Manager',True),('S1',True),('S2',False),('S3',False),('Finance',True)])
def test_customer_scope_read_and_write(db,client,accounts,sign_in,name,visible):
    obj = make_customer(db,accounts['S1'].id)
    other = make_customer(db,accounts['S3'].id,'其他团队')
    sign_in(name)
    r = client.get(f'/api/crm/customers/{obj.id}')
    assert r.status_code == (200 if visible else 404)
    listed = client.get('/api/crm/customers').json()['rows']
    assert any(x['id']==str(obj.id) for x in listed) == visible
    if name not in {'Owner','Admin','S3'}:
        assert client.get(f'/api/crm/customers/{other.id}').status_code == 404
    assert client.patch(f'/api/crm/customers/{obj.id}',json={'remark':'新备注'}).status_code == (403 if name=='Finance' else 200 if visible else 404)
    assert client.get(f'/api/crm/customers/{uuid4()}').status_code == 404


def test_complete_sales_chain_and_audit(db,client,accounts,sign_in):
    # 新增潜客默认关闭（客户以精斗云导入为准）；老板可在 CRM 设置中开启。
    sign_in('S1')
    assert client.post('/api/crm/customers',json={'customer_name':'独立潜客','mobile':'test-phone'}).status_code == 403
    sign_in('Owner')
    assert client.put('/api/crm/settings',json={'allow_prospect_create':True,'followup_edit_hours':12}).status_code == 200
    sign_in('S1')
    r = client.post('/api/crm/customers',json={'customer_name':'独立潜客','mobile':'test-phone'})
    assert r.status_code == 201, r.text
    cid = r.json()['customer']['id']
    assert r.json()['customer']['customer_code'] is None
    assert client.post('/api/crm/customers',json={'customer_name':'独立潜客'}).json()['duplicate_warning']
    contact = client.post(f'/api/crm/customers/{cid}/contacts',json={'name':'王采购','role_label':'采购','decision_role':'buyer'})
    assert contact.status_code == 201
    tomorrow = utcnow()+timedelta(days=1)
    p = follow_payload(contact_id=contact.json()['id'],material_sent=True,material_note='福利方案',quotation_sent=True,
                       next_action='电话确认报价',next_followup_at=tomorrow.isoformat())
    f = client.post(f'/api/crm/customers/{cid}/followups',json=p)
    assert f.status_code == 201, f.text
    for i in range(2):
        p['summary'] = '更新沟通 '+str(i)
        assert client.put(f'/api/crm/customers/{cid}/followups/{f.json()["id"]}',json=p).status_code == 200
    assert db.scalar(select(func.count()).select_from(Task)) == 1
    tasks = client.get('/api/crm/tasks?view=future').json()
    assert len(tasks)==1 and tasks[0]['source_type']=='followup'
    tid = tasks[0]['id']
    done = client.patch(f'/api/crm/tasks/{tid}',json={'status':'done','completion_result':'已联系'})
    assert done.status_code == 200 and done.json()['completed_at']
    stamp = done.json()['completed_at']
    assert client.patch(f'/api/crm/tasks/{tid}',json={'status':'done'}).json()['completed_at']==stamp
    assert db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.activity_type=='task_complete'))==1
    assert client.delete(f'/api/crm/customers/{cid}/followups/{f.json()["id"]}').status_code==405
    opp = {'opportunity_name':'福利采购','owner_user_id':str(accounts['S1'].id),'estimated_amount':'100.10','probability':'0.5000'}
    o = client.post(f'/api/crm/customers/{cid}/opportunities',json=opp)
    assert o.status_code == 201 and o.json()['weighted_amount']=='50.05', o.text
    opp.update(stage='lost',lost_reason='预算取消')
    closed = client.put(f'/api/crm/customers/{cid}/opportunities/{o.json()["id"]}',json=opp)
    assert closed.json()['status']=='lost'
    opp['stage']='initial'
    assert client.put(f'/api/crm/customers/{cid}/opportunities/{o.json()["id"]}',json=opp).status_code==409
    events = client.get(f'/api/crm/customers/{cid}').json()['events']
    assert {'followup_create','followup_update','task_complete','opportunity_create','opportunity_update'} <= {x['activity_type'] for x in events}
    sign_in('S2')
    assert client.patch(f'/api/crm/tasks/{tid}',json={'status':'done'}).status_code==404
    assert client.get('/api/crm/tasks?view=done').json()==[]
    assert client.put(f'/api/crm/customers/{cid}/opportunities/{o.json()["id"]}',json=opp).status_code==404


def test_contact_isolation_finance_process_redaction_and_edit_window(db,client,accounts,sign_in):
    obj = make_customer(db,accounts['S1'].id)
    other = make_customer(db,accounts['S2'].id)
    foreign = Contact(customer_id=other.id,name='不可串联')
    db.add(foreign)
    db.commit()
    sign_in('S1')
    assert client.post(f'/api/crm/customers/{obj.id}/followups',json=follow_payload(contact_id=str(foreign.id))).status_code==422
    f=client.post(f'/api/crm/customers/{obj.id}/followups',json=follow_payload()).json()
    row=db.get(Followup,UUID(f['id']))
    row.created_at=utcnow()-timedelta(days=2)
    db.commit()
    assert client.put(f'/api/crm/customers/{obj.id}/followups/{row.id}',json=follow_payload()).status_code==403
    sign_in('Finance')
    detail=client.get(f'/api/crm/customers/{obj.id}').json()
    assert detail['followups']==detail['tasks']==detail['opportunities']==detail['events']==[]
    assert client.post(f'/api/crm/customers/{obj.id}/followups',json=follow_payload()).status_code==403
    assert client.get('/api/crm/tasks').status_code==403


def test_transfer_pool_claim_keeps_history_and_work(db,client,accounts,sign_in):
    obj=make_customer(db,accounts['S1'].id)
    sign_in('S1')
    f=client.post(f'/api/crm/customers/{obj.id}/followups',json=follow_payload(next_action='联系',next_followup_at=(utcnow()+timedelta(days=1)).isoformat()))
    assert f.status_code==201
    assert client.post(f'/api/crm/customers/{obj.id}/transfer',json={'owner_user_id':str(accounts['S2'].id),'reason':'转交'}).status_code==403
    sign_in('Manager')
    assert client.post(f'/api/crm/customers/{obj.id}/transfer',json={'owner_user_id':str(accounts['S3'].id),'reason':'跨组'}).status_code==422
    assert client.post(f'/api/crm/customers/{obj.id}/transfer',json={'owner_user_id':str(accounts['S2'].id),'reason':'团队调整'}).status_code==200
    assert db.scalar(select(Task)).assignee_user_id==accounts['S2'].id
    assert db.scalar(select(Followup)).owner_user_id==accounts['S1'].id
    sign_in('S1')
    assert client.get(f'/api/crm/customers/{obj.id}').status_code==404
    sign_in('Manager')
    assert client.post(f'/api/crm/customers/{obj.id}/transfer',json={'owner_user_id':None,'reason':'进入公海'}).status_code==200
    sign_in('S3')
    assert client.get('/api/crm/customers?pool=true').json()['total']==1
    assert client.get(f'/api/crm/customers/{obj.id}').status_code==404
    assert client.post(f'/api/crm/customers/{obj.id}/claim').status_code==200
    assert db.scalar(select(Task)).assignee_user_id==accounts['S3'].id
    assert len(client.get(f'/api/crm/customers/{obj.id}').json()['followups'])==1
    sign_in('S2')
    # 认养不唯一：另一位业务员可以认养同一客户，仅第一个认养人成为负责人。
    assert client.post(f'/api/crm/customers/{obj.id}/claim').status_code==200
    assert client.get(f'/api/crm/customers/{obj.id}').status_code==200
    assert client.get('/api/crm/customers').json()['total']==1
    row=client.get('/api/crm/customers?pool=true').json()['rows'][0]
    assert row['owner_user_id']==str(accounts['S3'].id)
    assert {x['display_name'] for x in row['claims']}=={'S2','S3'}
    assert {x['user_id'] for x in client.get(f'/api/crm/customers/{obj.id}').json()['customer']['claims']}=={str(accounts['S2'].id),str(accounts['S3'].id)}
    assert client.post(f'/api/crm/customers/{obj.id}/claim').status_code==409
    assert db.scalar(select(func.count()).select_from(Assignment))==3


def test_default_tags_seeded_once_and_tag_filter(db,client,accounts,sign_in):
    sign_in('S1')
    tags=client.get('/api/crm/tags').json()
    assert {'重点客户','价格敏感','已流失'} <= {x['tag_name'] for x in tags}
    # Seeding is idempotent: a second read neither duplicates nor changes tags.
    assert client.get('/api/crm/tags').json()==tags
    tag_id=next(x['id'] for x in tags if x['tag_name']=='重点客户')
    obj=make_customer(db,accounts['S1'].id)
    assert client.put(f'/api/crm/customers/{obj.id}/tags',json={'tag_ids':[tag_id]}).status_code==200
    assert client.get('/api/crm/customers',params={'tag_id':tag_id}).json()['total']==1


def test_tag_rename_and_soft_delete_keeps_history(db,client,accounts,sign_in):
    sign_in('Admin')
    tag=client.post('/api/crm/tags',json={'tag_name':'旧名'}).json()
    renamed=client.put(f"/api/crm/tags/{tag['id']}",json={'tag_name':'新名','tag_group':'活动'}).json()
    assert renamed['tag_name']=='新名' and renamed['tag_group']=='活动'
    obj=make_customer(db,accounts['S1'].id)
    assert client.put(f"/api/crm/customers/{obj.id}/tags",json={'tag_ids':[tag['id']]}).status_code==200
    assert client.put(f"/api/crm/tags/{tag['id']}",json={'tag_name':'新名','is_active':False}).json()['is_active'] is False
    other=make_customer(db,accounts['S1'].id,'其他客户')
    sign_in('S1')
    # 已删除（停用）标签不能再打给新客户；原客户的关联与历史保留。
    assert client.put(f"/api/crm/customers/{other.id}/tags",json={'tag_ids':[tag['id']]}).status_code==422
    assert {x['tag_name'] for x in client.get(f"/api/crm/customers/{obj.id}").json()['tags']}=={'新名'}


def test_tags_config_and_filter(db,client,accounts,sign_in):
    obj=make_customer(db,accounts['S1'].id)
    sign_in('Admin')
    # 销售默认可建标签（sales_create_tags 默认开启）；显式关闭后禁止。
    assert client.put('/api/crm/settings',json={'sales_create_tags':False,'followup_edit_hours':12,'public_pool_claim_enabled':False}).status_code==200
    sign_in('S1')
    assert client.post('/api/crm/tags',json={'tag_name':'福利'}).status_code==403
    sign_in('Admin')
    tag=client.post('/api/crm/tags',json={'tag_name':'福利'})
    assert tag.status_code==201
    assert client.post('/api/crm/tags',json={'tag_name':'福利'}).status_code==409
    config={'sales_create_tags':True,'followup_edit_hours':12,'public_pool_claim_enabled':False}
    assert client.put('/api/crm/settings',json=config).status_code==200
    sign_in('S1')
    assert client.post('/api/crm/tags',json={'tag_name':'银行'}).status_code==201
    assert client.put('/api/crm/settings',json=config).status_code==403
    tid=tag.json()['id']
    for _ in range(2):
        assert client.put(f'/api/crm/customers/{obj.id}/tags',json={'tag_ids':[tid,tid]}).status_code==200
    assert client.get('/api/crm/customers',params={'tag_id':tid}).json()['total']==1
    assert client.put(f'/api/crm/customers/{obj.id}/tags',json={'tag_ids':[]}).status_code==200
    assert client.get('/api/crm/customers',params={'tag_id':tid}).json()['total']==0


def test_tag_creator_self_management(db,client,accounts,sign_in):
    # 销售默认可自建标签并自行改名/停用；他人标签不可改，老板与管理员可管理全部。
    sign_in('S1')
    mine=client.post('/api/crm/tags',json={'tag_name':'销售自建'})
    assert mine.status_code==201
    body=mine.json()
    assert body['created_by']==str(accounts['S1'].id)
    assert client.put(f"/api/crm/tags/{body['id']}",json={'tag_name':'销售改名','tag_group':None}).json()['tag_name']=='销售改名'
    assert client.put(f"/api/crm/tags/{body['id']}",json={'tag_name':'销售改名','is_active':False}).json()['is_active'] is False
    sign_in('S2')
    assert client.put(f"/api/crm/tags/{body['id']}",json={'tag_name':'抢改他人标签'}).status_code==403
    assert client.put(f"/api/crm/tags/{body['id']}",json={'tag_name':'抢恢复','is_active':True}).status_code==403
    sign_in('Manager')
    assert client.put(f"/api/crm/tags/{body['id']}",json={'tag_name':'经理抢改'}).status_code==403
    sign_in('Owner')
    assert client.put(f"/api/crm/tags/{body['id']}",json={'tag_name':'老板接管','is_active':True}).json()['tag_name']=='老板接管'
    # 经理同样可以自建并管理自己创建的标签。
    sign_in('Manager')
    manager_tag=client.post('/api/crm/tags',json={'tag_name':'经理自建'}).json()
    assert manager_tag['created_by']==str(accounts['Manager'].id)
    assert client.put(f"/api/crm/tags/{manager_tag['id']}",json={'tag_name':'经理改名'}).status_code==200


def test_bind_preserves_prospect_and_erp_namespace(db,client,accounts,sign_in):
    obj=make_customer(db,accounts['S1'].id)
    target=Customer(source_system='erp_test',customer_code='C001',customer_name='正式客户',normalized_name='正式客户',crm_managed=False)
    db.add(target)
    db.commit()
    sign_in('S1')
    assert client.post(f'/api/crm/customers/{obj.id}/bind',json={'target_id':str(target.id)}).status_code==403
    sign_in('Admin')
    for _ in range(2):
        assert client.post(f'/api/crm/customers/{obj.id}/bind',json={'target_id':str(target.id)}).status_code==200
    assert obj.id != target.id and target.customer_code=='C001' and obj.source_system=='crm'
    assert client.get('/api/crm/customers').json()['total']==1
    assert not obj.is_active
    assert client.get(f'/api/crm/customers/{target.id}').json()['customer']['customer_name']=='正式客户'
    assert client.patch(f'/api/crm/customers/{target.id}',json={'customer_name':'试图改事实'}).status_code==409
    assert db.scalar(select(func.count()).select_from(Assignment))==1


def test_import_preserves_manual_owner(db,accounts):
    from app.data_models import DataSource,ImportBatch
    from app.import_service import apply_master,digest_record
    source=DataSource(source_code='crm_test_erp',source_name='测试',entity_name='测试')
    db.add(source)
    db.flush()
    record={'code':'C1','name':'导入名称','salesperson':''}
    batch=ImportBatch(data_source_id=source.id,business_type='customer',original_filename='a.csv',storage_path='unused',file_hash='0'*64,
                      imported_by=accounts['Admin'].id,normalized_data={'records':[record]},options={})
    db.add(batch)
    db.flush()
    obj=Customer(source_system=source.source_code,customer_code='C1',customer_name='旧名',normalized_name='旧名',
                 last_import_batch_id=batch.id,source_fields={'code':'C1','name':'旧名'},owner_user_id=accounts['S1'].id,crm_managed=True,ownership_status='owned')
    db.add(obj)
    db.flush()
    counts=dict(inserted=0,updated=0,unchanged=0)
    apply_master(db,batch,source,counts)
    db.flush()
    assert obj.owner_user_id==accounts['S1'].id and obj.customer_name=='导入名称'
    apply_master(db,batch,source,counts)
    assert counts=={'inserted':0,'updated':1,'unchanged':1}
    assert digest_record(obj.source_fields)==digest_record(record)


@pytest.mark.parametrize('name,read,follow_write,contact_write,task_write,opp_write', [
    ('Owner',True,False,True,True,False),('Admin',True,False,False,False,False),
    ('Manager',True,True,True,True,True),('S1',True,True,True,True,True),
    ('S3',False,False,False,False,False),('Finance',False,False,False,False,False)])
def test_role_matrix_all_process_resources(db,client,accounts,sign_in,name,read,follow_write,contact_write,task_write,opp_write):
    obj=make_customer(db,accounts['S1'].id)
    sign_in('S1')
    f=client.post(f'/api/crm/customers/{obj.id}/followups',json=follow_payload())
    t=client.post('/api/crm/tasks',json={'title':'今天联系','assignee_user_id':str(accounts['S1'].id),'customer_id':str(obj.id),'due_at':utcnow().isoformat()})
    o=client.post(f'/api/crm/customers/{obj.id}/opportunities',json={'opportunity_name':'项目','owner_user_id':str(accounts['S1'].id)})
    assert (f.status_code,t.status_code,o.status_code)==(201,201,201)
    sign_in(name)
    for endpoint in ['followups','tasks','opportunities']:
        r=client.get('/api/crm/'+endpoint)
        assert r.status_code==(403 if name=='Finance' else 200)
        if r.status_code==200:
            assert bool(r.json())==read
    assert (client.post(f'/api/crm/customers/{obj.id}/followups',json=follow_payload()).status_code==201)==follow_write
    assert (client.post(f'/api/crm/customers/{obj.id}/contacts',json={'name':'联系人'}).status_code==201)==contact_write
    assert (client.patch(f'/api/crm/tasks/{t.json()["id"]}',json={'status':'done'}).status_code==200)==task_write
    assert (client.put(f'/api/crm/customers/{obj.id}/opportunities/{o.json()["id"]}',json={'opportunity_name':'更新','owner_user_id':str(accounts['S1'].id)}).status_code==200)==opp_write


def test_task_assignment_denies_customer_without_access_and_date_boundaries(db,client,accounts,sign_in):
    obj=make_customer(db,accounts['S1'].id)
    sign_in('Manager')
    payload={'title':'安排跟进','assignee_user_id':str(accounts['S2'].id),'customer_id':str(obj.id),'due_at':utcnow().isoformat()}
    assert client.post('/api/crm/tasks',json=payload).status_code==422
    payload['assignee_user_id']=str(accounts['S1'].id)
    assert client.post('/api/crm/tasks',json=payload).status_code==201
    sign_in('S1')
    assert client.get('/api/crm/tasks?view=today').json()[0]['source_type']=='manager'
    assert client.get('/api/crm/tasks?view=overdue').json()
    assert client.get('/api/crm/tasks?view=future').json()==[]
    assert client.get('/api/crm/tasks?offset=100').json()==[]
