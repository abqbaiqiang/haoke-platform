"""M4 overview first screen: fixed samples for scope, finance visibility and no-fake-zero semantics."""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from sqlalchemy import select

from app.bi_models import SalesTarget
from app.crm_models import Followup, Task
from app.data_models import Customer, FinancialMetric, FinancialPeriod, ImportBatch, SalesOrder
from app.models import utcnow
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
    # 导入即认可：未保存核实结论时经营销售额按已核实公式直接计算。
    assert by_code(body, 'EXEC_SALES_AMT')['value'] == '1000.30'
    assert by_code(body, 'SALE_ORDER_COUNT')['value'] == '4'
    assert by_code(body, 'SALE_CUSTOMER_COUNT')['value'] == '3'
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '1000.00'
    assert by_code(body, 'EXEC_GROSS_MARGIN_FIN')['value'] == '40.00'
    assert by_code(body, 'EXEC_NET_PROFIT')['value'] == '200.00'
    assert by_code(body, 'EXEC_NET_MARGIN')['value'] == '20.00'
    assert by_code(body, 'EXEC_CASH_BAL')['value'] == '300.00'
    assert by_code(body, 'EXEC_CASH_MOM')['value'] == '50.00'
    # 导入即认可：销售侧视为已核实，经营-财务勾稽差异正常给出（1000.30 - 1000.00）。
    assert by_code(body, 'EXEC_RECON_DIFF')['value'] == '0.30'
    assert not any('未核实' in w for w in body['finance_warnings'])  # 销售侧已视为核实，勾稽正常给出
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
    assert by_code(body, 'EXEC_SALES_AMT')['value'] == '0.30'
    assert body['finance_metrics'] == []
    assert not body['finance_warnings']
    # Manager team scope excludes S3.
    sign_in('Manager')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_SALES_AMT')['value'] == '100.30'
    assert body['finance_metrics'] == []
    # Finance sees finance figures but the source scope is the authorized subset.
    sign_in('Finance')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_SALES_AMT')['value'] == '0.30'
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '1000.00'
    # Admin: full business read access (2026-09-16 decision), same as owner.
    sign_in('Admin')
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_SALES_AMT')['value'] == '1000.30'
    assert by_code(body, 'EXEC_FIN_REVENUE')['value'] == '1000.00'


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


@pytest.mark.integration
def test_verified_overview_excludes_void_and_deducts_returns(db, client, accounts, sign_in, sample):  # noqa: F811
    """Regression for review findings 1+2: returns deducted, void excluded, counts consistent."""
    source, _, _, add = sample
    # September: two normal sales (0.10 + 0.20), one return (0.10), one voided 800 order.
    add('甲客户', '0.10', '2026-09-01')
    add('甲客户', '0.20', '2026-09-02')
    add('甲客户', '0.10', '2026-09-03', status='return')
    add('作废客户', '800.00', '2026-09-04', 'S1', status='void')
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    # Sample base (1000.30) + 0.10 + 0.20 - 0.10 return; void 800 excluded.
    assert by_code(body, 'EXEC_SALES_AMT')['value'] == '1000.50'
    assert by_code(body, 'SALE_ORDER_COUNT')['value'] == '6'
    assert by_code(body, 'SALE_CUSTOMER_COUNT')['value'] == '3'
    assert all(m['code'] != 'DQ_SALES_RECON' for m in body['sales_metrics'])
    # Reconciliation difference now computed against the verified formula.
    batch = fin_period(db, source, '2026-09-01', actor=accounts['Admin'])
    fin_metric(db, batch, '2026-09-01', 'profit', 'revenue', period_value=Decimal('1000.00'))
    db.commit()
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert by_code(body, 'EXEC_RECON_DIFF')['value'] == '0.50'
    # Unverified overview keeps the raw source reconciliation labelled as such.
    sign_in('Owner')
    review_off = client.put(f'/api/bi/reviews/{source.id}', json={
        'coverage_from': '2025-01-01', 'coverage_to': '2026-09-09', 'valid_statuses': ['valid'],
        'staff_mapping_complete': True, 'full_history': True, 'reason': '人工夹具已验证，非真实业务数据',
        'acknowledge_export_scope': True, 'excluded_statuses': [], 'return_statuses': []})
    assert review_off.status_code == 200
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    # Unverified: every raw row counts (1000.30 + 0.10 + 0.20 + 0.10 + 800.00).
    assert by_code(body, 'DQ_SALES_RECON')['value'] == '1800.70'
    assert by_code(body, 'SALE_ORDER_COUNT')['value'] == '8'
    assert by_code(body, 'SALE_CUSTOMER_COUNT')['value'] == '4'


@pytest.mark.integration
def test_owner_dashboard_structure_ranking_and_attention(db, client, accounts, sign_in, sample):  # noqa: F811
    source, product, customers, add = sample
    # Give customer levels and a staff target so the dashboard blocks have data.
    for name, level in [('甲客户', 'A'), ('乙客户', 'B')]:
        c = customers[name]
        c.customer_level = level
    db.add(SalesTarget(user_id=accounts['S1'].id, period_month=date.fromisoformat('2026-09-01'),
                       sales_amount_target=Decimal('0.50'), created_by=accounts['Owner'].id))
    db.commit()
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    body = client.get(f'/api/bi/overview?source_id={source.id}').json()
    # Customer structure groups by level with shares of the verified total.
    labels = {s['label'] for s in body['customer_structure']}
    assert any(v.startswith('A') for v in labels) and any(v.startswith('B') for v in labels)
    top_product = body['product_structure'][0]
    assert top_product['label'] == '样品甲' and top_product['amount'] == '1000.30'
    assert sum(Decimal(s['amount']) for s in body['product_structure']) == Decimal('1000.30')
    rank = {r['name']: r for r in body['person_ranking']}
    assert rank['S1']['amount'] == '0.30' and rank['S1']['completion'] == '60.0'
    assert Decimal(rank['S2']['amount']) == Decimal('100.00') and Decimal(rank['S3']['amount']) == Decimal('900.00')
    # Attention block: no dormant customers yet, but the block reports its state.
    assert isinstance(body['attention_total'], int)
    # Staff role receives no dashboard extras.
    sign_in('S1')
    empty = client.get(f'/api/bi/overview?source_id={source.id}').json()
    assert empty['customer_structure'] == [] and empty['person_ranking'] == []


@pytest.mark.integration
def test_workbench_warns_when_orders_have_no_salesperson(db, client, accounts, sign_in, sample):  # noqa: F811
    source, product, customers, add = sample
    # Order without a mappable salesperson stays unattributed; the workbench must say so
    # instead of silently excluding it from personal performance.
    add('未映射客户', '55.00', '2026-09-05', None)
    db.commit()
    sign_in('S1')
    body = client.get(f"/api/bi/workbench/{accounts['S1'].id}?month=2026-09-01").json()
    assert any('未关联业务员' in w and source.source_name in w for w in body['warnings'])
    # Simulate the mapping being completed and the file re-imported: every order now attributes.
    unmapped = db.scalar(select(SalesOrder).where(SalesOrder.sales_user_id.is_(None)))
    unmapped.sales_user_id = accounts['S1'].id
    db.commit()
    body = client.get(f"/api/bi/workbench/{accounts['S1'].id}?month=2026-09-01").json()
    assert not any('未关联业务员' in w for w in body['warnings'])


@pytest.mark.integration
def test_quarterly_target_save_and_workbench_completion(db, client, accounts, sign_in, sample):  # noqa: F811
    source, product, customers, add = sample
    # Q3 (Jul-Sep) orders for S1: 0.10 (Aug) + 0.10 + 0.20 (Sep) = 0.40; monthly target stays separate.
    sign_in('Owner')
    assert client.put(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-09-01', 'type': 'monthly'},
                      json={'amount': '0.50', 'remark': None}).status_code == 200
    bad = client.put(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-09-01', 'type': 'quarterly'},
                     json={'amount': '1.00', 'remark': None})
    assert bad.status_code == 422  # quarter target must sit on a quarter start month
    assert client.put(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-07-01', 'type': 'quarterly'},
                      json={'amount': '0.60', 'remark': 'Q3'}).status_code == 200
    body = client.get(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-07-01', 'type': 'quarterly'}).json()
    assert body['amount'] == '0.60' and body['target_type'] == 'quarterly'
    sign_in('S1')
    work = client.get(f"/api/bi/workbench/{accounts['S1'].id}", params={'month': '2026-09-01'}).json()
    m = {x['code']: x['value'] for x in work['metrics']}
    assert m['TGT_MONTH_AMT'] == '0.50' and m['EXEC_SALES_AMT'] == '0.30'
    assert m['TGT_QUARTER_AMT'] == '0.60' and m['TGT_QUARTER_COMPLETION'] == '66.67'
    assert m['TGT_QUARTER_PROGRESS'] is not None
    # Monthly row and quarterly row coexist for the same user.
    assert client.get(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-09-01', 'type': 'monthly'}).json()['amount'] == '0.50'


@pytest.mark.integration
def test_quarterly_only_target_stays_out_of_month_metrics(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    # 季度目标不能被月度口径读取：仅设置 Q3 目标时，七月工作台月目标必须为空。
    sign_in('Owner')
    assert client.put(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-07-01', 'type': 'quarterly'},
                      json={'amount': '9.00', 'remark': None}).status_code == 200
    sign_in('S1')
    work = client.get(f"/api/bi/workbench/{accounts['S1'].id}", params={'month': '2026-07-01'}).json()
    m = {x['code']: x['value'] for x in work['metrics']}
    assert m['TGT_MONTH_AMT'] is None and m['TGT_QUARTER_AMT'] == '9.00'
    # 同月同时存在月度与季度目标：月度读取必须拿到月度记录，两者互不串用。
    sign_in('Owner')
    assert client.put(f"/api/bi/targets/{accounts['S1'].id}", params={'month': '2026-07-01', 'type': 'monthly'},
                      json={'amount': '0.50', 'remark': None}).status_code == 200
    sign_in('S1')
    work = client.get(f"/api/bi/workbench/{accounts['S1'].id}", params={'month': '2026-07-01'}).json()
    m = {x['code']: x['value'] for x in work['metrics']}
    assert m['TGT_MONTH_AMT'] == '0.50' and m['TGT_QUARTER_AMT'] == '9.00'


@pytest.mark.integration
def test_workbench_counts_claimed_pool_customer_process_data(db, client, accounts, sign_in):  # noqa: F811
    # 公海认养客户的过程数据（跟进/待办/商机）必须进入认养人的工作台统计，与 CRM 可见范围一致。
    pool = Customer(source_system='fixture', customer_code='POOL-CLAIM-1', customer_name='公海认养客户',
                    normalized_name='公海认养客户', owner_user_id=None, ownership_status='public_pool', crm_managed=False)
    db.add(pool)
    db.commit()
    sign_in('S1')
    assert client.post(f'/api/crm/customers/{pool.id}/claim').status_code == 200
    db.add(Followup(customer_id=pool.id, owner_user_id=accounts['S1'].id, interaction_method='phone',
                    contact_result='good', summary='认养后首次跟进', occurred_at=utcnow()))
    db.add(Task(customer_id=pool.id, assignee_user_id=accounts['S1'].id, title='今日跟进认养客户',
                due_at=utcnow(), source_type='manual', created_by=accounts['S1'].id, task_type='followup'))
    db.commit()
    body = client.get(f"/api/bi/workbench/{accounts['S1'].id}", params={'month': '2026-09-01'}).json()
    assert body['today_tasks'] == 1
    m = {x['code']: x['value'] for x in body['metrics']}
    assert m['CRM_FOLLOWUP_COUNT'] == '1' and m['CRM_FOLLOWUP_CUSTOMERS'] == '1'
    # 未认养该客户的他人仍看不到这些过程数据。
    sign_in('S2')
    other = client.get(f"/api/bi/workbench/{accounts['S2'].id}", params={'month': '2026-09-01'}).json()
    om = {x['code']: x['value'] for x in other['metrics']}
    assert other['today_tasks'] == 0 and om['CRM_FOLLOWUP_COUNT'] == '0'


@pytest.mark.integration
def test_finance_reports_page_lists_months_with_status(db, client, accounts, sign_in, sample):  # noqa: F811
    """老板 2026-09-18：财务报表独立成页——按月列出关键数与确认状态；销售不可见。"""
    src = sample[0]
    sign_in('S1')
    assert client.get(f'/api/bi/finance-reports?source_id={src.id}').status_code == 403
    sign_in('Owner')
    body = client.get(f'/api/bi/finance-reports?source_id={src.id}').json()
    assert body['source_id'] == str(src.id)
    # m1 夹具若导入过财务月则逐月校验关键数字段存在且状态自洽。
    for m in body['months']:
        assert {'month', 'confirmed', 'revenue', 'net_profit', 'cash', 'ar', 'inventory'} <= set(m)
        if m['confirmed']:
            assert m['profit_uploaded'] or m['balance_uploaded']
