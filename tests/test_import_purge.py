"""Owner-initiated purge of imported data and duplicate-safe re-import (导入即认可口径)."""
from decimal import Decimal

from sqlalchemy import func, select

from app.crm_models import Contact, CustomerClaim
from app.data_models import (Customer, ImportBatch, Product, SalesOrder, SalesOrderLine)
from app.import_service import apply_master, apply_sales
from app.models import ActivityLog


def master_batch(db, src, accounts, kind, records):
    batch = ImportBatch(data_source_id=src.id, business_type=kind, original_filename=f'{kind}.csv',
        storage_path='unused', file_hash=(kind + '0' * 61)[:64], imported_by=accounts['Admin'].id, status='success',
        normalized_data={'records': records}, options={})
    db.add(batch)
    db.flush()
    return batch


def seed_source(db, src, accounts):
    apply_master(db, master_batch(db, src, accounts, 'customer',
        [{'code': 'C1', 'name': 'CRM客户'}, {'code': 'C2', 'name': '纯导入客户'}]), src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    apply_master(db, master_batch(db, src, accounts, 'product', [{'code': 'P1', 'name': '商品一'}]),
                 src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    sales = master_batch(db, src, accounts, 'sales', [{
        'order_no': 'X1', 'order_date': '2026-09-01', 'customer_code': 'C1', 'sales_amount': '100.00',
        'discount_amount': '0', 'net_amount': '100.00', 'received_amount': '0', 'payment_status': '未收款',
        'source_updated_at': None, 'salesperson': '',
        'lines': [{'product_code': 'P1', 'quantity': '1', 'unit_price': '100.00', 'unit_name': '盒',
                   'warehouse_name': '默认仓库', 'line_amount': '100.00'}]}])
    apply_sales(db, sales, src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    db.commit()


def test_purge_permissions_and_confirmation(db, client, accounts, sign_in):
    src = make_source(db)
    seed_source(db, src, accounts)
    sign_in('S1')
    assert client.delete(f'/api/data/sources/{src.id}/data', params={'confirm': src.source_name}).status_code == 403
    sign_in('Owner')
    assert client.delete(f'/api/data/sources/{src.id}/data', params={'confirm': '错误名称'}).status_code == 422
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 1  # wrong confirm deletes nothing


def make_source(db):
    from app.data_models import DataSource
    src = DataSource(source_code='purge_test', source_name='清空测试账套', entity_name='清空测试公司')
    db.add(src)
    db.flush()
    return src


def test_purge_keeps_crm_history_and_audit(db, client, accounts, sign_in):
    src = make_source(db)
    seed_source(db, src, accounts)
    crm_customer = db.scalar(select(Customer).where(Customer.customer_code == 'C1'))
    db.add(Contact(customer_id=crm_customer.id, name='联系人'))
    db.add(CustomerClaim(customer_id=crm_customer.id, user_id=accounts['S1'].id))
    db.commit()

    sign_in('Owner')
    result = client.delete(f'/api/data/sources/{src.id}/data', params={'confirm': src.source_name})
    assert result.status_code == 200, result.text
    body = result.json()
    assert body == {'orders': 1, 'order_lines': 1, 'customers_removed': 1, 'customers_deactivated': 1, 'products_removed': 1}
    # Orders and lines are gone; the untouched master row is gone; the CRM-referenced one is deactivated, not orphaned.
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 0
    assert db.scalar(select(func.count()).select_from(SalesOrderLine)) == 0
    assert db.scalar(select(func.count()).select_from(Product)) == 0
    assert db.scalar(select(func.count()).select_from(Customer)) == 1  # C2 removed, C1 deactivated and kept
    db.refresh(crm_customer)
    assert crm_customer.is_active is False
    # Trace stays: import batches, original audit entry.
    assert db.scalar(select(func.count()).select_from(ImportBatch)) == 3
    assert db.scalar(select(ActivityLog).where(ActivityLog.activity_type == 'import_data_purge'))


def test_reimport_after_purge_is_duplicate_free(db, client, accounts, sign_in):
    src = make_source(db)
    seed_source(db, src, accounts)
    sign_in('Owner')
    assert client.delete(f'/api/data/sources/{src.id}/data', params={'confirm': src.source_name}).status_code == 200
    # Re-import the same files: masters are revived/recreated, orders refill exactly once.
    seed_source(db, src, accounts)
    orders = db.scalars(select(SalesOrder)).all()
    assert len(orders) == 1 and orders[0].order_no == 'X1'
    assert db.scalar(select(func.sum(SalesOrder.sales_amount))) == Decimal('100.00')
    assert db.scalar(select(func.count()).select_from(SalesOrderLine)) == 1
    assert db.scalar(select(func.count()).select_from(Customer)) == 2
    assert db.scalar(select(Customer).where(Customer.customer_code == 'C1')).is_active is True
    # And a straight second re-import without purge stays idempotent (no doubling).
    seed_source(db, src, accounts)
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 1
    assert db.scalar(select(func.sum(SalesOrder.sales_amount))) == Decimal('100.00')


def test_mapping_only_reimport_reattributes_without_version_conflict(db, accounts):
    # 用户工作流：先导入（无映射），保存映射后重导同一文件 → 只应重新归属，不允许 409。
    src = make_source(db)
    apply_master(db, master_batch(db, src, accounts, 'customer', [{'code': 'C1', 'name': '客户一'}]),
                 src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    apply_master(db, master_batch(db, src, accounts, 'product', [{'code': 'P1', 'name': '商品一'}]),
                 src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    record = {
        'order_no': 'X1', 'order_date': '2026-09-01', 'customer_code': 'C1', 'sales_amount': '100.00',
        'discount_amount': '0', 'net_amount': '100.00', 'received_amount': '0', 'payment_status': '未收款',
        'source_updated_at': None, 'salesperson': '李延伟',
        'lines': [{'product_code': 'P1', 'quantity': '1', 'unit_price': '100.00', 'unit_name': '盒',
                   'warehouse_name': '默认仓库', 'line_amount': '100.00'}]}
    apply_sales(db, master_batch(db, src, accounts, 'sales', [record]), src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    order = db.scalar(select(SalesOrder))
    assert order.sales_user_id is None and order.version == 1
    # Same file re-imported after the mapping was saved: identical record, mapping in batch options.
    remap = master_batch(db, src, accounts, 'sales', [record])
    remap.options = {'staff': {'李延伟': str(accounts['S1'].id)}}
    counts = {'inserted': 0, 'updated': 0, 'unchanged': 0}
    apply_sales(db, remap, src, counts)
    db.commit()
    db.refresh(order)
    assert counts['updated'] == 1
    assert order.sales_user_id == accounts['S1'].id and order.version == 1
    assert db.scalar(select(func.count()).select_from(SalesOrderLine)) == 1
    # 内容真正变化（无时间戳）时按最新上传更新，不再要求人工核对。
    changed = master_batch(db, src, accounts, 'sales', [{**record, 'sales_amount': '999.00',
        'lines': [{**record['lines'][0], 'unit_price': '999.00', 'line_amount': '999.00'}]}])
    changed.options = {'staff': {'李延伟': str(accounts['S1'].id)}}
    counts = {'inserted': 0, 'updated': 0, 'unchanged': 0}
    apply_sales(db, changed, src, counts)
    db.refresh(order)
    assert counts['updated'] == 1 and order.version == 2
    assert db.scalar(select(func.sum(SalesOrder.sales_amount))) == Decimal('999.00')


def sales_record(no, day, stamp, amount):
    return {'order_no': no, 'order_date': day, 'customer_code': 'C1', 'sales_amount': amount,
        'discount_amount': '0', 'net_amount': amount, 'received_amount': '0', 'payment_status': '未收款',
        'source_updated_at': stamp, 'salesperson': '',
        'lines': [{'product_code': 'P1', 'quantity': '1', 'unit_price': amount, 'unit_name': '盒',
                   'warehouse_name': '默认仓库', 'line_amount': amount}]}


def test_overlapping_month_files_dedupe_and_extend(db, accounts):
    # 场景：先传上个月文件，再传“上个月+这个月”合并文件 → 重复订单去重，新订单补入。
    src = make_source(db)
    apply_master(db, master_batch(db, src, accounts, 'customer', [{'code': 'C1', 'name': '客户一'}]),
                 src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    apply_master(db, master_batch(db, src, accounts, 'product', [{'code': 'P1', 'name': '商品一'}]),
                 src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    august = sales_record('X1', '2026-08-20', '2026-08-31T10:00:00+08:00', '50.00')
    apply_sales(db, master_batch(db, src, accounts, 'sales', [august]), src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    counts = {'inserted': 0, 'updated': 0, 'unchanged': 0}
    combined = sales_record('X1', '2026-08-20', '2026-08-31T10:00:00+08:00', '50.00')
    september = sales_record('X2', '2026-09-10', '2026-09-11T09:00:00+08:00', '70.00')
    apply_sales(db, master_batch(db, src, accounts, 'sales', [combined, september]), src, counts)
    assert counts == {'inserted': 1, 'updated': 0, 'unchanged': 1}
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 2
    assert db.scalar(select(func.sum(SalesOrder.sales_amount))) == Decimal('120.00')
    # 合并文件中订单被修改过（修改时间更新）→ 版本更新；旧文件再传不回退。
    edited = sales_record('X1', '2026-08-20', '2026-09-10T09:00:00+08:00', '55.00')
    apply_sales(db, master_batch(db, src, accounts, 'sales', [edited]), src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
    order = db.scalar(select(SalesOrder).where(SalesOrder.order_no == 'X1'))
    assert order.version == 2 and order.sales_amount == Decimal('55.00')
    stale = sales_record('X1', '2026-08-20', '2026-08-31T10:00:00+08:00', '50.00')
    from fastapi import HTTPException
    try:
        apply_sales(db, master_batch(db, src, accounts, 'sales', [stale]), src, {'inserted': 0, 'updated': 0, 'unchanged': 0})
        assert False, 'expected 409'
    except HTTPException as exc:
        assert exc.status_code == 409


def test_batch_discard_permissions_and_scope(db, client, accounts, sign_in):
    from app.data_models import RawImportRow
    src = make_source(db)
    seed_source(db, src, accounts)
    pending = ImportBatch(data_source_id=src.id, business_type='sales', original_filename='待处理.csv',
        storage_path='unused', file_hash='p' * 64, imported_by=accounts['Admin'].id, status='pending',
        normalized_data={'records': []}, options={})
    db.add(pending)
    db.flush()
    db.add(RawImportRow(import_batch_id=pending.id, sheet_name='S1', row_no=1, raw_data={}, parse_status='ok'))
    db.commit()
    sign_in('S1')
    assert client.delete(f'/api/data/imports/{pending.id}').status_code == 403
    sign_in('Owner')
    assert client.delete(f'/api/data/imports/{pending.id}').status_code == 200
    assert db.scalar(select(ImportBatch).where(ImportBatch.id == pending.id)) is None
    assert db.scalar(select(RawImportRow).where(RawImportRow.import_batch_id == pending.id)) is None
    success = db.scalar(select(ImportBatch).where(ImportBatch.status == 'success'))
    assert client.delete(f'/api/data/imports/{success.id}').status_code == 409
    assert db.scalar(select(ImportBatch).where(ImportBatch.id == success.id)) is not None


def test_reimport_after_purge_reactivates_claimed_customer(db, client, accounts, sign_in):
    # 清空导入后，被 CRM 认养引用而停用的主档，重导相同内容必须恢复可见，而不是被“内容相同”跳过。
    src = make_source(db)
    seed_source(db, src, accounts)
    c1 = db.scalar(select(Customer).where(Customer.customer_code == 'C1'))
    db.add(CustomerClaim(customer_id=c1.id, user_id=accounts['S1'].id))
    db.commit()
    sign_in('Owner')
    assert client.delete(f'/api/data/sources/{src.id}/data', params={'confirm': src.source_name}).status_code == 200
    db.refresh(c1)
    assert c1.is_active is False
    seed_source(db, src, accounts)
    db.refresh(c1)
    assert c1.is_active is True
    # 认养关系保留，主档仍是同一行（未删除重建）。
    assert db.scalar(select(func.count()).select_from(Customer).where(Customer.customer_code == 'C1')) == 1
    assert db.scalar(select(func.count()).select_from(CustomerClaim).where(CustomerClaim.customer_id == c1.id)) == 1
