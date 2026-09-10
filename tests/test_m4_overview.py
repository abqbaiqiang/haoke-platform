"""M4 overview first screen: fixed samples for scope, finance visibility and no-fake-zero semantics."""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.data_models import FinancialMetric, FinancialPeriod, ImportBatch
from test_m3 import NOW, sample  # noqa: F401  (fixture re-export)


def fin_period(db, source, month, closed=False, profit=True, balance=True, actor=None):
    batch = ImportBatch(data_source_id=source.id, business_type='profit', original_filename='p.csv',
        storage_path='unused', file_hash=uuid4().hex, imported_by=actor.id, status='success')
    db.add(batch)
    db.flush()
    period = FinancialPeriod(data_source_id=source.id, period_month=date.fromisoformat(month), is_closed=closed,
        profit_import_batch_id=batch.id if profit else None,
        balance_import_batch_id=batch.id if balance else None)
    db.add(period)
    return batch


def fin_metric(db, batch, month, statement, code, period_value=None, end_value=None):
    db.add(FinancialMetric(period_month=date.fromisoformat(month), statement_type=statement,
        metric_code=code, metric_name=code, period_value=period_value, end_value=end_value,
        import_batch_id=batch.id))


def by_code(body, code):
    return next(m for m in body['sales_metrics'] + body['finance_metrics'] if m['code'] == code)


@pytest.mark.integration
def test_owner_overview_sales_and_finance_side_by_side(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    batch = fin_period(db, source, '2026-09-01', closed=True, actor=accounts['Admin'])
    fin_metric(db, batch, '2026-09-01', 'profit', 'revenue', period_value=Decimal('1000.00'))
    fin_metric(db, batch, '2026-09-01', 'profit', 'cost', period_value=Decimal('600.00'))
    fin_metric(db, batch, '2026-09-01', 'profit', 'net_profit', period_value=Decimal('200.00'))
    fin_metric(db, batch, '2026-09-01', 'balance_sheet', 'cash', end_value=Decimal('300.00'))
    fin_metric(db, batch, '2026-09-01', 'balance_sheet', 'ar', end_value=Decimal('80.00'))
    fin_metric(db, batch, '2026-09-01', 'balance_sheet', 'inventory', end_value=Decimal('50.00'))
    prev = fin_period(db, source, '2026-08-01', actor=accounts['Admin'])
    fin_metric(db, prev, '2026-08-01', 'balance_sheet', 'cash', end_value=Decimal('250.00'))
    db.commit()
    sign_in('Owner')
    r = client.get(f'/api/bi/overview?source_id={source.id}')
    assert r.status_code == 200, r.text
    body = r.json()
    # 2026-09 orders: 0.10 + 0.20 + 100.00 + 900.00 (S3 is inside the owner scope).
    assert by_code(body, 'DQ_SALES_RECON')['value'] == '1000.30'
    assert by_code(body, 'SALE_ORDER_COUNT')['value'] == '4'
    assert by_code(body, 'SALE_CUSTOMER_COUNT')['value'] == '3'
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '1000.00'
    assert by_code(body, 'EXEC_GROSS_MARGIN_FIN')['value'] == '40.00'
    assert by_code(body, 'EXEC_NET_PROFIT')['value'] == '200.00'
    assert by_code(body, 'EXEC_NET_MARGIN')['value'] == '20.00'
    assert by_code(body, 'EXEC_CASH_BAL')['value'] == '300.00'
    assert by_code(body, 'EXEC_CASH_MOM')['value'] == '50.00'
    # Sales unverified: reconciliation difference must not be computed as if verified.
    assert all(m['code'] != 'EXEC_RECON_DIFF' for m in body['finance_metrics'])
    assert any('未核实' in w for w in body['finance_warnings'])
    assert len(body['trend']) == 6 and body['trend'][-1]['date'] == '2026-09-01'
    assert body['trend'][-1]['value'] == '1000.30'
    # August only has the 0.10 order in history.
    assert body['trend'][-2]['value'] == '0.10'


@pytest.mark.integration
def test_finance_and_margin_zero_division_is_null_not_fake_zero(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    batch = fin_period(db, source, '2026-09-01', actor=accounts['Admin'])
    fin_metric(db, batch, '2026-09-01', 'profit', 'revenue', period_value=Decimal('0'))
    fin_metric(db, batch, '2026-09-01', 'profit', 'cost', period_value=Decimal('0'))
    fin_metric(db, batch, '2026-09-01', 'profit', 'net_profit', period_value=Decimal('0'))
    db.commit()
    sign_in('Owner')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '0.00'
    assert by_code(body, 'EXEC_GROSS_MARGIN_FIN')['value'] is None
    assert by_code(body, 'EXEC_NET_MARGIN')['value'] is None
    assert by_code(body, 'EXEC_CASH_BAL')['value'] is None
    assert by_code(body, 'EXEC_CASH_MOM')['value'] is None


@pytest.mark.integration
def test_overview_role_scope_and_finance_redaction(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    batch = fin_period(db, source, '2026-09-01', actor=accounts['Admin'])
    fin_metric(db, batch, '2026-09-01', 'profit', 'revenue', period_value=Decimal('1000.00'))
    db.commit()
    # Sales sees own orders only and no finance figures.
    sign_in('S1')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'DQ_SALES_RECON')['value'] == '0.30'
    assert body['finance_metrics'] == []
    assert not body['finance_warnings']
    # Manager team scope excludes S3.
    sign_in('Manager')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'DQ_SALES_RECON')['value'] == '100.30'
    assert body['finance_metrics'] == []
    # Finance sees finance figures but the source scope is the authorized subset.
    sign_in('Finance')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'DQ_SALES_RECON')['value'] == '0.30'
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '1000.00'
    # Admin has no business data access at all.
    sign_in('Admin')
    assert client.get(f'/api/bi/overview?source_id={source.id}').status_code == 403


@pytest.mark.integration
def test_overview_without_finance_reports_and_unconfirmed_period(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    sign_in('Owner')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] is None
    assert any('利润表尚未导入' in w for w in body['finance_warnings'])
    assert any('资产负债表尚未导入' in w for w in body['finance_warnings'])
    batch = fin_period(db, source, '2026-09-01', closed=False, actor=accounts['Admin'])
    fin_metric(db, batch, '2026-09-01', 'profit', 'revenue', period_value=Decimal('100.00'))
    db.commit()
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '100.00'
    assert any('尚未确认' in w for w in body['finance_warnings'])
