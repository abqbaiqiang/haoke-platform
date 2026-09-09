import json
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.data_models import FinancialMetric, ImportBatch, RawImportRow, SalesOrder, SalesOrderLine
from m1_fixtures import finance, master, sales

pytestmark = pytest.mark.integration


@pytest.fixture
def setup_m1(client, sign_in, accounts, db, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), 'upload_root', str(tmp_path/'uploads'))
    sign_in('Admin')
    response = client.post('/api/data/sources', json={'source_code': 'test_erp', 'source_name': '测试账套', 'entity_name': '测试公司'})
    assert response.status_code == 201, response.text
    source = response.json()['id']
    assert client.put(f'/api/data/sources/{source}/staff', json={'staff': {'甲': str(accounts['S1'].id), '乙': str(accounts['S2'].id)}}).status_code == 200

    def upload(kind, body, **options):
        response = client.post('/api/data/imports', params={'source_id': source, 'kind': kind,
             'filename': 'fixture.xlsx' if kind in {'profit', 'balance_sheet'} else 'fixture.csv', 'options': json.dumps(options)},
             content=body, headers={'Content-Type': 'application/octet-stream'})
        assert response.status_code == 201, response.text
        return response.json()

    def confirm(batch, **options):
        return client.post(f"/api/data/imports/{batch['id']}/confirm", json={'acknowledge_warnings': True, **options})

    for kind, body in [('customer', master()), ('product', master('product', 'P001', '测试商品'))]:
        assert confirm(upload(kind, body)).status_code == 200
    return source, upload, confirm


def test_full_import_idempotency_original_and_raw_trace(client, setup_m1, db, sign_in, monkeypatch):
    source, upload, confirm = setup_m1
    body = sales(prices=('0.10', '0.10'))
    batch = upload('sales', body)
    assert batch['preview']['summary']['lines'] == 2
    assert confirm(batch).status_code == 200
    again = upload('sales', body)
    assert again['duplicate_of'] == batch['id']
    assert confirm(again).json()['preview']['result']['unchanged'] == 1
    assert confirm(batch).status_code == 200
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 1
    assert db.scalar(select(func.count()).select_from(SalesOrderLine).where(SalesOrderLine.is_active)) == 2
    assert client.get(f"/api/data/imports/{batch['id']}/file").content == body
    assert db.scalar(select(func.count()).select_from(RawImportRow).where(RawImportRow.import_batch_id == batch['id'])) == 4
    sign_in('Owner')
    from datetime import UTC, datetime
    monkeypatch.setattr('app.import_api.utcnow', lambda: datetime(2026, 7, 31, 16, 30, tzinfo=UTC))
    report = client.get('/api/data/sales/monthly', params={'source_id': source}).json()
    assert report['rows'][0]['amount'] == '0.20'
    assert report['rows'][0]['orders'] == 1
    assert report['rows'][0]['incomplete_month']  # Shanghai has already entered August.


def test_changed_order_replaces_current_lines_and_preserves_history(setup_m1, db):
    _, upload, confirm = setup_m1
    assert confirm(upload('sales', sales())).status_code == 200
    new = upload('sales', sales(stamp='2026-08-02 10:00:00', prices=('0.40',)))
    assert confirm(new).status_code == 200
    order = db.scalar(select(SalesOrder))
    assert str(order.sales_amount) == '0.40' and order.version == 2
    assert db.scalar(select(func.count()).select_from(SalesOrderLine)) == 3
    assert db.scalar(select(func.count()).select_from(SalesOrderLine).where(SalesOrderLine.is_active)) == 1
    stale = upload('sales', sales())
    assert confirm(stale).status_code == 409
    db.refresh(order)
    assert str(order.sales_amount) == '0.40'


def test_missing_reference_or_bad_total_never_writes_fact(setup_m1, db):
    _, upload, confirm = setup_m1
    for body in [sales(product='MISSING'), sales().replace(b'0.30', b'100.00')]:
        b = upload('sales', body)
        assert b['status'] == 'failed'
        assert b['preview']['errors']
        assert confirm(b).status_code == 409
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 0


@pytest.mark.parametrize('name,status', [('Owner', 403), ('Manager', 403), ('S1', 403), ('Finance', 403), ('Admin', 201)])
def test_sales_upload_roles(client, setup_m1, sign_in, name, status):
    source, _, _ = setup_m1
    sign_in(name)
    response = client.post('/api/data/imports', params={'source_id': source, 'kind': 'sales', 'filename': 'x.csv'},
                           content=sales(), headers={'Content-Type': 'application/octet-stream'})
    assert response.status_code == status


@pytest.mark.parametrize('name,orders', [('Owner', 2), ('Manager', 2), ('S1', 1), ('Finance', 1), ('Admin', None)])
def test_sales_scope_and_no_cost_leak(client, setup_m1, sign_in, name, orders, db):
    source, upload, confirm = setup_m1
    assert confirm(upload('sales', sales())).status_code == 200
    assert confirm(upload('sales', sales(order='T002', staff='乙'))).status_code == 200
    sign_in(name)
    response = client.get('/api/data/sales/monthly', params={'source_id': source})
    if orders is None:
        assert response.status_code == 403
    else:
        assert response.json()['rows'][0]['orders'] == orders
    if name == 'S1':
        other = db.scalar(select(SalesOrder).where(SalesOrder.order_no == 'T002'))
        assert client.get(f'/api/data/sales/orders/{other.id}').status_code == 404
        own = db.scalar(select(SalesOrder).where(SalesOrder.order_no == 'T001'))
        detail = client.get(f'/api/data/sales/orders/{own.id}')
        assert detail.status_code == 200 and 'cost' not in detail.text


def test_finance_cannot_read_sales_preview_raw_or_files(client, setup_m1, sign_in):
    _, upload, _ = setup_m1
    b = upload('sales', sales())
    sign_in('Finance')
    for suffix in ['', '/rows', '/file']:
        assert client.get(f"/api/data/imports/{b['id']}{suffix}").status_code == 404
    assert not client.get('/api/data/imports').json()


def test_finance_versions_and_closed_period(client, setup_m1, sign_in, db):
    source, upload, confirm = setup_m1
    sign_in('Finance')
    original_body = finance()
    original = upload('profit', original_body)
    assert confirm(original).status_code == 200
    assert confirm(upload('balance_sheet', finance('balance_sheet'))).status_code == 200
    duplicate = upload('profit', original_body)
    assert confirm(duplicate).json()['preview']['result']['unchanged'] == 32
    assert db.scalar(select(func.count()).select_from(FinancialMetric)) == 85
    changed = upload('profit', finance(revenue=110))
    assert confirm(changed).status_code == 409
    assert confirm(changed, replace_version=True).status_code == 200
    assert db.scalar(select(func.count()).select_from(FinancialMetric)) == 117
    period = client.get('/api/data/finance/periods', params={'source_id': source}).json()[0]
    assert client.patch(f"/api/data/finance/periods/{period['id']}", json={'is_closed': True}).status_code == 403
    sign_in('Admin')
    assert client.patch(f"/api/data/finance/periods/{period['id']}", json={'is_closed': True}).status_code == 200
    assert confirm(upload('profit', finance(revenue=120)), replace_version=True).status_code == 409
    sign_in('Owner')
    current = client.get('/api/data/finance/monthly', params={'source_id': source}).json()['rows'][0]
    assert current['confirmed']
    assert current['metrics'][0]['code'] == 'revenue'
    assert next(m for m in current['metrics'] if m['code'] == 'revenue')['period_value'] == '110.00'


def test_blank_finance_confirmation_and_entity_check(setup_m1):
    _, upload, confirm = setup_m1
    assert confirm(upload('profit', finance(blank=True))).status_code == 409
    assert confirm(upload('profit', finance(blank=True), blank_as_zero=True)).status_code == 200


def test_storage_traversal_size_and_hash(client, setup_m1, db, monkeypatch):
    source, upload, confirm = setup_m1
    for name in ['../x.csv', 'C:\\x.csv', 'x.exe']:
        response = client.post('/api/data/imports', params={'source_id': source, 'kind': 'sales', 'filename': name},
                               content=sales(), headers={'Content-Type': 'application/octet-stream'})
        assert response.status_code == 422
    b = upload('sales', sales())
    stored = db.get(ImportBatch, b['id'])
    (Path(get_settings().upload_root)/stored.storage_path).write_bytes(b'tampered')
    assert confirm(b).status_code == 409
    monkeypatch.setattr(get_settings(), 'import_max_bytes', 5)
    response = client.post('/api/data/imports', params={'source_id': source, 'kind': 'sales', 'filename': 'x.csv'},
                           content=b'123456', headers={'Content-Type': 'application/octet-stream'})
    assert response.status_code == 413


def test_changed_mapping_requires_new_precheck(client, setup_m1, accounts):
    source, upload, confirm = setup_m1
    b = upload('sales', sales())
    client.put(f'/api/data/sources/{source}/staff', json={'staff': {'甲': str(accounts['S2'].id)}})
    assert confirm(b).status_code == 409


def test_batch_write_denied_and_unknown_resource(client, setup_m1, sign_in):
    _, upload, _ = setup_m1
    b = upload('sales', sales())
    for name in ['Owner', 'Manager', 'S1']:
        sign_in(name)
        assert client.post(f"/api/data/imports/{b['id']}/confirm", json={}).status_code in {403, 404}
    assert client.get(f'/api/data/imports/{uuid4()}').status_code == 404


def test_mid_batch_conflict_rolls_back_earlier_changes(setup_m1, db):
    _, upload, confirm = setup_m1
    assert confirm(upload('sales', sales(order='OLD', stamp='2026-08-03 10:00:00'))).status_code == 200
    # First order would insert, second conflicts. No partial order or active-line change may survive.
    first = sales(order='NEW')
    second = sales(order='OLD').decode('utf-8-sig').split('\r\n', 1)[1]
    combined = first + second.encode('utf-8')
    assert confirm(upload('sales', combined)).status_code == 409
    assert db.scalar(select(func.count()).select_from(SalesOrder)) == 1
    assert db.scalar(select(SalesOrder).where(SalesOrder.order_no == 'NEW')) is None
    assert db.scalar(select(func.count()).select_from(SalesOrderLine).where(SalesOrderLine.is_active)) == 2


def test_cross_source_keys_are_independent(client, setup_m1, db):
    source, upload, confirm = setup_m1
    assert confirm(upload('sales', sales())).status_code == 200
    second = client.post('/api/data/sources', json={'source_code': 'other_erp', 'source_name': '另一测试账套',
                                                   'entity_name': '测试公司'}).json()['id']
    for kind, data in [('customer', master()), ('product', master('product', 'P001', '测试商品')), ('sales', sales())]:
        result = client.post('/api/data/imports', params={'source_id': second, 'kind': kind, 'filename': 'x.csv'},
                             content=data, headers={'Content-Type': 'application/octet-stream'})
        assert result.status_code == 201
        assert confirm(result.json()).status_code == 200
    assert source != second and db.scalar(select(func.count()).select_from(SalesOrder)) == 2


@pytest.mark.parametrize('name,allowed', [('Owner', True), ('Admin', True), ('Finance', True), ('Manager', False), ('S1', False)])
def test_finance_preview_is_scoped_nullable_and_read_only(client, setup_m1, sign_in, db, name, allowed):
    _, upload, _ = setup_m1
    batch = upload('profit', finance(blank=True))
    assert batch['status'] == 'pending'
    sign_in(name)
    response = client.get(f"/api/data/imports/{batch['id']}/finance-preview")
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        preview = response.json()
        assert preview['requires_blank_confirmation'] and not preview['blank_as_zero']
        assert preview['period'] == '2026-08-01' and preview['entity_name'] == '测试公司'
        assert len(preview['records']) == 32
        row = next(r for r in preview['records'] if r['row'] == 6)
        assert row['period_value'] is None and row['ytd_value'] == '0.00'
        assert preview['records'][0]['period_value'] == '100.00'
    db.expire_all()
    stored = db.get(ImportBatch, batch['id'])
    assert stored.status == 'pending' and not stored.options['blank_as_zero']
    assert db.scalar(select(func.count()).select_from(FinancialMetric)) == 0


def test_finance_preview_balance_and_invalid_batches(client, setup_m1, db):
    _, upload, _ = setup_m1
    batch = upload('balance_sheet', finance('balance_sheet'))
    preview = client.get(f"/api/data/imports/{batch['id']}/finance-preview").json()
    assert preview['statement_type'] == 'balance_sheet' and len(preview['records']) == 53
    cash = next(r for r in preview['records'] if r['metric_code'] == 'cash')
    assert cash['end_value'] == '100.00' and cash['begin_value'] == '100.00'
    assert cash['period_value'] is None and cash['ytd_value'] is None
    business = upload('sales', sales())
    assert client.get(f"/api/data/imports/{business['id']}/finance-preview").status_code == 404
    failed = upload('profit', b'not a workbook')
    assert client.get(f"/api/data/imports/{failed['id']}/finance-preview").status_code == 409
    assert client.get(f'/api/data/imports/{uuid4()}/finance-preview').status_code == 404
    assert db.scalar(select(func.count()).select_from(FinancialMetric)) == 0
