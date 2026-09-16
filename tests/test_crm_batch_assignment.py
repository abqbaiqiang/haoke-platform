from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.crm_models import Assignment
from app.data_models import Customer, DataSource, ImportBatch
from app.import_service import apply_master
from app.models import ActivityLog


def unassigned(db, code='C1'):
    row = Customer(source_system='batch_test', customer_code=code, customer_name='同名客户',
                   normalized_name='同名客户', ownership_status='unassigned')
    db.add(row)
    db.commit()
    return row


def payload(accounts, *rows):
    return {'customer_ids': [str(r.id) for r in rows], 'owner_user_id': str(accounts['S1'].id),
            'reason': '导入客户首次分配'}


@pytest.mark.parametrize('actor,status', [('Owner',200),('Admin',200),('Manager',403),('S1',403),('Finance',403)])
def test_batch_role_permissions(db,client,accounts,sign_in,actor,status):
    row=unassigned(db)
    sign_in(actor)
    assert client.post('/api/crm/customers/batch-assign',json=payload(accounts,row)).status_code==status
    db.refresh(row)
    assert (row.owner_user_id==accounts['S1'].id)==(status==200)


def test_batch_visibility_audit_and_repeated_request(db,client,accounts,sign_in):
    rows=[unassigned(db,str(i)) for i in range(2)]
    sign_in('S1')
    assert client.get('/api/crm/customers?ownership=unassigned').json()['total']==0
    sign_in('Owner')
    assert client.get('/api/crm/customers?ownership=unassigned').json()['total']==2
    body=payload(accounts,*rows,rows[0])
    assert client.post('/api/crm/customers/batch-assign',json=body).json()=={'assigned_count':2}
    assert client.post('/api/crm/customers/batch-assign',json=body).status_code==409
    assert db.scalar(select(func.count()).select_from(Assignment))==2
    assert db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.activity_type=='customer_transfer'))==2
    assert client.get('/api/crm/customers?ownership=unassigned').json()['total']==0
    sign_in('S1')
    assert client.get('/api/crm/customers').json()['total']==2
    assert client.get(f'/api/crm/customers/{rows[0].id}').status_code==200
    sign_in('S2')
    assert client.get('/api/crm/customers').json()['total']==0
    assert client.get(f'/api/crm/customers/{rows[0].id}').status_code==404


@pytest.mark.parametrize('conflict,status',[('owned',409),('claimed_pool',409),('inactive',404),('missing',404)])
def test_batch_rejects_entire_stale_selection(db,client,accounts,sign_in,conflict,status):
    first,second=unassigned(db,'1'),unassigned(db,'2')
    if conflict=='owned':
        second.owner_user_id=accounts['S2'].id
        second.ownership_status='owned'
    if conflict=='claimed_pool':
        second.ownership_status='public_pool'
        second.owner_user_id=accounts['S2'].id
        second.crm_managed=True
    if conflict=='inactive':
        second.is_active=False
    db.commit()
    body=payload(accounts,first,second)
    if conflict=='missing':
        body['customer_ids'][1]=str(uuid4())
    sign_in('Owner')
    assert client.post('/api/crm/customers/batch-assign',json=body).status_code==status
    db.refresh(first)
    assert first.owner_user_id is None
    assert db.scalar(select(func.count()).select_from(Assignment))==0


def test_batch_assign_from_public_pool(db,client,accounts,sign_in):
    rows=[unassigned(db,str(i)) for i in range(2)]
    for row in rows:
        row.ownership_status='public_pool'
    db.commit()
    sign_in('Owner')
    assert client.post('/api/crm/customers/batch-assign',json=payload(accounts,*rows)).status_code==200
    for row in rows:
        db.refresh(row)
        assert row.owner_user_id==accounts['S1'].id and row.ownership_status=='owned'


def test_imported_customers_enter_public_pool_idempotently(db,accounts):
    src=DataSource(source_code='pool_test',source_name='测试',entity_name='测试')
    db.add(src)
    db.flush()
    record={'code':'P1','name':'公海客户'}
    batch=ImportBatch(data_source_id=src.id,business_type='customer',original_filename='a.csv',storage_path='unused',
        file_hash='0'*64,imported_by=accounts['Admin'].id,normalized_data={'records':[record]},options={})
    db.add(batch)
    db.flush()
    counts={'inserted':0,'updated':0,'unchanged':0}
    apply_master(db,batch,src,counts)
    row=db.scalar(select(Customer).where(Customer.customer_code=='P1'))
    assert counts['inserted']==1
    assert row.owner_user_id is None and row.ownership_status=='public_pool'
    # Pool entry timestamp is recorded on the import path too (used by future pool-recycling rules).
    assert row.public_pool_entered_at is not None
    apply_master(db,batch,src,counts)
    assert counts=={'inserted':1,'updated':0,'unchanged':1}
    assert db.scalar(select(func.count()).select_from(Customer))==1


def test_batch_input_and_target_validation(db,client,accounts,sign_in):
    row=unassigned(db)
    sign_in('Owner')
    for changes in [{'customer_ids':[]},{'customer_ids':[str(row.id)]*1001},{'reason':' '},
                    {'owner_user_id':str(accounts['Owner'].id)},{'owner_user_id':str(uuid4())}]:
        assert client.post('/api/crm/customers/batch-assign',json={**payload(accounts,row),**changes}).status_code==422
    accounts['S1'].is_active=False
    db.commit()
    assert client.post('/api/crm/customers/batch-assign',json=payload(accounts,row)).status_code==422


def test_reimport_after_batch_keeps_customer_id_owner_and_count(db,client,accounts,sign_in):
    src=DataSource(source_code='batch_test',source_name='测试',entity_name='测试')
    db.add(src)
    db.flush()
    record={'code':'C1','name':'更新后的精斗云名称'}
    batch=ImportBatch(data_source_id=src.id,business_type='customer',original_filename='a.csv',storage_path='unused',
        file_hash='0'*64,imported_by=accounts['Admin'].id,normalized_data={'records':[record]},options={})
    db.add(batch)
    db.flush()
    row=unassigned(db)
    row.last_import_batch_id=batch.id
    row.source_fields={'code':'C1','name':'旧名称'}
    db.commit()
    original_id=row.id
    sign_in('Owner')
    assert client.post('/api/crm/customers/batch-assign',json=payload(accounts,row)).status_code==200
    counts=dict(inserted=0,updated=0,unchanged=0)
    apply_master(db,batch,src,counts)
    db.flush()
    apply_master(db,batch,src,counts)
    assert counts=={'inserted':0,'updated':1,'unchanged':1}
    assert row.id==original_id and row.owner_user_id==accounts['S1'].id and row.crm_managed
    assert row.customer_name==record['name']
    assert db.scalar(select(func.count()).select_from(Customer))==1
