"""Pool manual entry and bulk entry: permissions, dedup, claim integration."""
from sqlalchemy import select

from app.crm_models import Contact
from app.data_models import Customer


def pool_row(db, name='公海录入客户'):
    return db.scalar(select(Customer).where(Customer.customer_name == name))


def test_pool_entry_permissions(db, client, accounts, sign_in):
    body = {'customer_name': '公海录入客户', 'mobile': '13900000001', 'remark': '展会名片'}
    for index, (actor, status) in enumerate([('Manager', 201), ('Owner', 201), ('Admin', 201), ('S1', 403), ('Finance', 403)]):
        sign_in(actor)
        payload = {**body, 'customer_name': f'{actor}客户', 'mobile': f'1390000010{index}'}
        assert client.post('/api/crm/customers/pool', json=payload).status_code == status
    sign_in('Manager')
    created = client.post('/api/crm/customers/pool', json=body).json()
    assert created['duplicate_warning'] is False
    row = pool_row(db, '公海录入客户')
    assert row.ownership_status == 'public_pool' and row.owner_user_id is None and not row.crm_managed
    assert row.public_pool_entered_at is not None
    assert db.scalar(select(Contact).where(Contact.customer_id == row.id, Contact.mobile == '13900000001'))
    # Duplicate name or mobile is flagged, not merged.
    assert client.post('/api/crm/customers/pool', json={'customer_name': ' 公海录入客户 '}).json()['duplicate_warning'] is True
    assert client.post('/api/crm/customers/pool', json={'customer_name': '另一个名字', 'mobile': '13900000001'}).json()['duplicate_warning'] is True
    assert client.get('/api/crm/customers?pool=true').json()['total'] >= 1


def test_full_width_parenthesis_duplicate_flag(db, client, accounts, sign_in):
    """审计 P1-05 护栏：客户名仅有全角/半角括号差异时，重名检测必须命中（normalize_name 归一化）。"""
    sign_in('Owner')
    # 全角先建档，半角重复必须告警。
    assert client.post('/api/crm/customers/pool', json={'customer_name': '括号重名客户（济南）'}).json()['duplicate_warning'] is False
    assert client.post('/api/crm/customers/pool', json={'customer_name': '括号重名客户(济南)'}).json()['duplicate_warning'] is True
    # 反向：半角先建档，全角重复同样必须告警。
    assert client.post('/api/crm/customers/pool', json={'customer_name': '括号重名客户乙(青岛)'}).json()['duplicate_warning'] is False
    assert client.post('/api/crm/customers/pool', json={'customer_name': '括号重名客户乙（青岛）'}).json()['duplicate_warning'] is True


def test_pool_bulk_entry_dedup_and_claim(db, client, accounts, sign_in):
    sign_in('Owner')
    body = {'items': [
        {'customer_name': '批量客户甲', 'mobile': '13800000001', 'remark': '备注一'},
        {'customer_name': '批量客户乙'},
        {'customer_name': '批量客户甲', 'mobile': '13800000001'},
        {'customer_name': '批量客户丙', 'mobile': '13800000001'},
    ]}
    result = client.post('/api/crm/customers/pool-import', json=body)
    assert result.status_code == 201
    assert result.json() == {'created_count': 2, 'duplicate_names': ['批量客户甲', '批量客户丙']}
    assert client.post('/api/crm/customers/pool-import', json=body).json()['created_count'] == 0
    rows = db.scalars(select(Customer).where(Customer.customer_name.in_(['批量客户甲', '批量客户乙']))).all()
    assert all(r.ownership_status == 'public_pool' and r.owner_user_id is None for r in rows)
    assert db.scalar(select(Contact).where(Contact.mobile == '13800000001', Contact.is_active))
    # Sales can immediately claim the entered pool customer and becomes its owner.
    sign_in('S1')
    target = next(r for r in rows if r.customer_name == '批量客户甲')
    assert client.post(f'/api/crm/customers/{target.id}/claim').status_code == 200
    db.refresh(target)
    assert target.owner_user_id == accounts['S1'].id


def test_pool_bulk_input_limits(db, client, accounts, sign_in):
    sign_in('Owner')
    assert client.post('/api/crm/customers/pool-import', json={'items': []}).status_code == 422
    assert client.post('/api/crm/customers/pool-import', json={'items': [{'customer_name': ''}]}).status_code == 422
    assert client.post('/api/crm/customers/pool-import', json={'items': [{'customer_name': 'x' * 256}]}).status_code == 422
    sign_in('S1')
    assert client.post('/api/crm/customers/pool-import', json={'items': [{'customer_name': '销售录入'}]}).status_code == 403


def test_pool_claim_filter_and_batch_claim(db, client, accounts, sign_in):
    sign_in('Owner')
    client.post('/api/crm/customers/pool-import', json={'items': [
        {'customer_name': '认养筛选甲', 'mobile': '13700000001'},
        {'customer_name': '认养筛选乙', 'mobile': '13700000002'},
        {'customer_name': '认养筛选丙', 'mobile': '13700000003'},
    ]})
    rows = {r.customer_name: r for r in db.scalars(select(Customer).where(
        Customer.customer_name.in_(['认养筛选甲', '认养筛选乙', '认养筛选丙']))).all()}
    sign_in('S1')
    client.post(f"/api/crm/customers/{rows['认养筛选甲'].id}/claim")
    # Claim filter: claimed vs unclaimed partitions the pool.
    unclaimed = client.get('/api/crm/customers', params={'pool': True, 'claim': 'unclaimed'}).json()
    claimed = client.get('/api/crm/customers', params={'pool': True, 'claim': 'claimed'}).json()
    names_unclaimed = {r['customer_name'] for r in unclaimed['rows']}
    names_claimed = {r['customer_name'] for r in claimed['rows']}
    assert '认养筛选甲' in names_claimed and '认养筛选甲' not in names_unclaimed
    assert {'认养筛选乙', '认养筛选丙'} <= names_unclaimed
    # Batch claim: two more claimed, one skipped (already claimed by S1).
    result = client.post('/api/crm/customers/batch-claim', json={'customer_ids': [
        str(rows['认养筛选甲'].id), str(rows['认养筛选乙'].id), str(rows['认养筛选丙'].id)]})
    assert result.status_code == 200, result.text
    assert result.json()['claimed_count'] == 2 and result.json()['skipped'] == ['认养筛选甲']
    assert client.post('/api/crm/customers/batch-claim', json={'customer_ids': [str(rows['认养筛选乙'].id)]}).json()['claimed_count'] == 0
    # Mobile search finds own customers by contact phone (non-pool only); needs the prospect switch on.
    sign_in('Owner')
    client.put('/api/crm/settings', json={'allow_prospect_create': True, 'followup_edit_hours': 12})
    sign_in('S1')
    client.post('/api/crm/customers', json={'customer_name': '手机号搜索客户', 'mobile': '13700009999'})
    found = client.get('/api/crm/customers', params={'q': '13700009999'}).json()
    assert any(r['customer_name'] == '手机号搜索客户' for r in found['rows'])


def test_sales_can_set_customer_level(db, client, accounts, sign_in):
    obj = make_simple_customer(db, accounts['S1'].id)
    sign_in('S1')
    ok = client.patch(f"/api/crm/customers/{obj.id}", json={'customer_level': 'A'})
    assert ok.status_code == 200, ok.text
    assert ok.json()['customer_level'] == 'A'
    denied = client.patch(f"/api/crm/customers/{obj.id}", json={'customer_type': '经销商'})
    assert denied.status_code == 403


def make_simple_customer(db, owner, name='等级测试客户'):
    obj = Customer(source_system='crm', customer_name=name, normalized_name=name, owner_user_id=owner,
                   ownership_status='owned', crm_managed=True)
    db.add(obj)
    db.commit()
    return obj


def test_sales_customer_filters_by_level_and_tag(db, client, accounts, sign_in):
    obj = make_simple_customer(db, accounts['S1'].id, '筛选客户甲')
    sign_in('S1')
    assert client.patch(f"/api/crm/customers/{obj.id}", json={'customer_level': 'B'}).status_code == 200
    tag = client.post('/api/crm/tags', json={'tag_name': '重点跟进筛选'}).json()
    assert client.put(f"/api/crm/customers/{obj.id}/tags", json={'tag_ids': [tag['id']]}).status_code == 200
    by_level = client.get('/api/sales/customers', params={'level': 'B'}).json()
    assert any(r['id'] == str(obj.id) for r in by_level['rows'])
    by_tag = client.get('/api/sales/customers', params={'tag_id': tag['id']}).json()
    assert any(r['id'] == str(obj.id) for r in by_tag['rows'])
    assert client.get('/api/sales/customers', params={'level': 'A'}).json()['total'] == 0
