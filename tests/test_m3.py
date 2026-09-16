"""Fixed artificial samples for M3 money, source readiness and backend isolation."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.bi_calculations import money, ratio, shift_month, target_metrics, work_dates
from app.bi_models import BISetting, SalesTarget
from app.bi_schemas import ReviewInput, Settings, TargetInput
from app.crm_models import Followup, Opportunity, Task
from app.data_models import Customer, DataSource, ImportBatch, Product, SalesOrder, SalesOrderLine
from app.models import ActivityLog

NOW = datetime(2026, 9, 9, 4, tzinfo=timezone.utc)  # Shanghai noon, Wednesday.
MONTH = '2026-09-01'


def metrics(body):
    return {r['code']: r['value'] for r in body['metrics']}


@pytest.fixture
def sample(db, accounts, monkeypatch):
    monkeypatch.setattr('app.bi_service.utcnow', lambda: NOW)
    source = DataSource(source_code='m3_test', source_name='人工测试账套', entity_name='人工测试公司')
    db.add(source)
    db.flush()
    batch = ImportBatch(data_source_id=source.id, business_type='sales', original_filename='fake.csv',
        storage_path='not-a-real-file', file_hash='a'*64, imported_by=accounts['Admin'].id, status='succeeded')
    db.add(batch)
    db.flush()
    product = Product(source_system=source.source_code, product_code='P1', product_name='样品甲', last_import_batch_id=batch.id)
    db.add(product)
    db.flush()
    customers = {}
    def add(name, amount, day, staff='S1', status='valid', unit='盒', line_amount=None):
        if name not in customers:
            c = Customer(source_system=source.source_code, customer_code=name, customer_name=name,
                normalized_name=name, owner_user_id=accounts[staff].id if staff else None, last_import_batch_id=batch.id)
            db.add(c)
            db.flush()
            customers[name] = c
        order = SalesOrder(source_system=source.source_code, order_no=uuid4().hex, order_date=date.fromisoformat(day),
            customer_id=customers[name].id, sales_user_id=accounts[staff].id if staff else None,
            sales_amount=Decimal(amount), source_status=status, content_hash=uuid4().hex,
            updated_at=NOW-timedelta(days=1), last_import_batch_id=batch.id)
        db.add(order)
        db.flush()
        line = SalesOrderLine(sales_order_id=order.id, version=1, line_no=1, product_id=product.id,
            quantity=Decimal('1'), unit_name=unit, line_amount=Decimal(line_amount or amount), last_import_batch_id=batch.id)
        db.add(line)
        db.flush()
        return order
    add('甲客户', '0.10', '2026-09-01')
    add('甲客户', '0.20', '2026-09-02')
    add('甲客户', '0.10', '2026-08-01')
    add('乙客户', '100.00', '2026-09-03', 'S2')
    add('外部客户', '900.00', '2026-09-04', 'S3')
    db.commit()
    return source, product, customers, add


def review(client, source, **kwargs):
    return client.put(f'/api/bi/reviews/{source.id}', json={
        'coverage_from': '2025-01-01', 'coverage_to': '2026-09-09', 'valid_statuses': ['valid'],
        'staff_mapping_complete': True, 'full_history': True, 'reason': '人工夹具已验证，非真实业务数据',
        'acknowledge_export_scope': True, **kwargs})


def test_sales_workspace_monthly_trend_uses_verified_months_and_self_scope(client, sample, sign_in):
    source = sample[0]
    url = f'/api/sales/monthly-trend?source_id={source.id}&month=2026-09-01'
    sign_in('S1')
    # 导入即认可：未保存核实结论时，已存在的月份直接按已核实口径出数。
    data = client.get(url)
    assert data.status_code == 200
    data = data.json()
    assert len(data['points']) == 6
    assert [p['date'] for p in data['points']] == [f'2026-{m:02d}-01' for m in range(4,10)]
    assert data['points'][-1]['value'] == '0.30'
    assert data['points'][-2]['value'] == '0.10'
    sign_in('Owner')
    assert client.get(url).status_code == 403
    # 显式核实结论覆盖默认口径：有效状态不含数据中的状态时月份回到缺失。
    assert review(client, source, valid_statuses=['未使用状态'], coverage_from='2026-01-01',
                  coverage_to='2026-09-09').status_code == 200
    sign_in('S1')
    values = [p['value'] for p in client.get(url).json()['points']]
    # 4-7 月无订单，为 0.00；8-9 月有 'valid' 单据但不在核实状态口径内，金额缺失。
    assert values[:4] == ['0.00'] * 4 and values[4] is None and values[5] is None
    # 恢复正常核实结论后，各销售只见自己的月份金额（self scope）。
    sign_in('Owner')
    assert review(client, source).status_code == 200
    sign_in('S2')
    assert client.get(url).json()['points'][-1]['value'] == '100.00'
    assert client.get(url.replace('2026-09-01','2026-09-02')).status_code == 422


@pytest.mark.unit
def test_decimal_calendar_and_target_boundaries():
    uid = uuid4()
    cfg = Settings(calendar={'2026-09-05': True, '2026-09-07': False},
                   personal_calendar={str(uid): {'2026-09-05': False}})
    days = work_dates(date(2026, 9, 1), uid, cfg)
    assert date(2026, 9, 5) not in days and date(2026, 9, 7) not in days
    result = {m.code: m.value for m in target_metrics(Decimal('0.30'), Decimal('0.10')+Decimal('0.20'),
        days, date(2026, 9, 9), Decimal('0.20'), date(2026, 9, 1))}
    assert result['TGT_COMPLETION'] == '100.00'
    assert result['TGT_REMAINING'] == '0.00'
    assert result['TGT_WEIGHTED_FORECAST'] == '0.50'
    zero = {m.code: m.value for m in target_metrics(Decimal(0), Decimal(1), [], date(2026, 9, 30), Decimal(0), date(2026, 9, 1))}
    assert zero['TGT_COMPLETION'] is None and zero['TGT_TIME_PROGRESS'] is None
    assert zero['TGT_DAILY_REQUIRED'] is None and ratio(1, 0) is None
    assert shift_month(date(2026, 1, 1), -1) == date(2025, 12, 1)
    assert len(work_dates(date(2024, 2, 1), uid, Settings(work_week=list(range(7))))) == 29
    assert money(Decimal('0.105')) == '0.11'


@pytest.mark.unit
@pytest.mark.parametrize('value', ['-1', 'NaN', 'Infinity', '1.001', '10000000000000000'])
def test_target_rejects_invalid_money(value):
    with pytest.raises(ValueError):
        TargetInput(amount=value)


@pytest.mark.unit
def test_configuration_validation():
    for config in [{'work_week':[7]}, {'work_week':[1, 1]}, {'dormant_days':180, 'lost_warning_days':90},
                   {'effective_activity_types':['user_login']}, {'followup_days':{'A':0}}]:
        with pytest.raises(ValueError):
            Settings(**config)
    with pytest.raises(ValueError):
        ReviewInput(coverage_from='2026-01-01', coverage_to='2026-12-01', valid_statuses=['void'],
            reason='bad overlap', acknowledge_export_scope=True)


@pytest.mark.integration
def test_sales_basis_import_implies_verified_and_review_overrides(client, sign_in, sample, accounts):
    src, _, _, _ = sample
    sign_in('S1')
    # 导入即认可：已核实口径直接出数；源单据视图仍可查看原始金额。
    raw = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'basis':'source'}).json()
    assert raw['basis'] == '源销售核对'
    assert raw['metrics'][0]['code'] == 'DQ_SALES_RECON' and raw['metrics'][0]['value'] == '0.30'
    official = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'basis':'verified'}).json()
    assert official['basis'] == '已确认经营销售' and official['verified'] is True
    assert metrics(official)['EXEC_SALES_AMT'] == '0.30'
    work = client.get(f"/api/bi/workbench/{accounts['S1'].id}", params={'month':MONTH}).json()
    assert metrics(work)['EXEC_SALES_AMT'] == '0.30'
    # 显式核实结论覆盖默认口径：状态口径不含现有单据时回到未核实，不虚报业绩。
    sign_in('Owner')
    assert review(client, src, valid_statuses=['未使用状态'], coverage_from='2026-01-01',
                  coverage_to='2026-09-09').status_code == 200
    sign_in('S1')
    official = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'basis':'verified'}).json()
    assert metrics(official)['EXEC_SALES_AMT'] is None
    work = client.get(f"/api/bi/workbench/{accounts['S1'].id}", params={'month':MONTH}).json()
    assert metrics(work)['EXEC_SALES_AMT'] is None


@pytest.mark.integration
def test_verified_money_contribution_idempotency_versions_and_review_invalidation(db, client, sign_in, sample):
    src, product, _, add = sample
    void = add('甲客户', '800.00', '2026-09-05', status='void')
    add('甲客户', '0.10', '2026-09-06', status='return')
    db.add(SalesOrderLine(sales_order_id=void.id, version=0, line_no=1, product_id=product.id,
        quantity=999, line_amount=999, is_active=False, last_import_batch_id=void.last_import_batch_id))
    db.commit()
    sign_in('Admin')
    assert review(client, src).status_code == 200
    sign_in('S1')
    params = {'source_id':str(src.id), 'month':MONTH, 'basis':'verified', 'limit':1}
    report = client.get('/api/bi/sales', params=params).json()
    assert report['verified']
    m = metrics(report)
    assert m['EXEC_SALES_AMT'] == '0.20' and m['SALE_ORDER_COUNT'] == '2'
    assert m['SALE_MOM'] == '100.00' and m['SALE_YOY'] is None
    assert m['CUS_NEW_TRANSACT'] == '0' and m['CUS_RETURNING'] == '1'
    assert report['total_change'] == '0.10'
    assert Decimal(report['rows'][0]['change'])+Decimal(report['other_change']) == Decimal(report['total_change'])
    product_report = client.get('/api/bi/sales', params={**params, 'dimension':'product'}).json()
    assert product_report['rows'][0]['current'] == '0.20'
    assert product_report['line_difference'] == '0.00'
    assert client.get('/api/bi/sales', params=params).json() == report
    # A subsequent changed fact requires a new explicit review.
    void.updated_at = NOW + timedelta(seconds=1)
    db.commit()
    assert metrics(client.get('/api/bi/sales', params=params).json())['EXEC_SALES_AMT'] is None


@pytest.mark.integration
def test_missing_prior_does_not_manufacture_growth(db, client, sign_in, sample):
    src, _, _, _ = sample
    sign_in('Admin')
    assert review(client, src, coverage_from=MONTH, full_history=False).status_code == 200
    sign_in('Owner')
    result = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'basis':'verified'}).json()
    assert metrics(result)['SALE_MOM'] is None
    assert result['total_change'] is None
    assert all(r['previous'] is None and r['change'] is None for r in result['rows'])
    assert metrics(result)['CUS_NEW_TRANSACT'] is None


@pytest.mark.integration
@pytest.mark.parametrize('actor,allowed,work,write,config', [
    ('Owner',True,True,True,True), ('Manager',True,True,True,False), ('S1',True,True,False,False),
    ('S2',True,False,False,False), ('Finance',True,False,False,False), ('Admin',True,True,True,True)])
def test_five_role_api_matrix(client, sign_in, accounts, sample, actor, allowed, work, write, config):
    src, _, _, _ = sample
    uid = accounts['S1'].id
    sign_in(actor)
    sales = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH})
    assert sales.status_code == (200 if allowed else 403)
    wb = client.get(f'/api/bi/workbench/{uid}', params={'month':MONTH})
    assert wb.status_code == (200 if work else 404 if actor == 'S2' else 403)
    put = client.put(f'/api/bi/targets/{uid}', params={'month':MONTH}, json={'amount':'100.00'})
    assert put.status_code == (200 if write else 403)
    assert client.put('/api/bi/settings', json={}).status_code == (200 if config else 403)
    assert client.get('/api/bi/team', params={'month':MONTH}).status_code == (200 if actor in {'Owner','Manager','Admin'} else 403)
    assert client.get('/api/bi/attention', params={'source_id':str(src.id)}).status_code == (200 if allowed else 403)
    assert client.get('/api/bi/orders', params={'source_id':str(src.id), 'month':MONTH}).status_code == (200 if allowed else 403)
    assert review(client, src).status_code == (200 if config else 403)


@pytest.mark.integration
def test_scope_filters_names_rankings_totals_and_drilldown(client, sign_in, accounts, sample):
    src, _, customers, _ = sample
    for actor, amount in [('S1','0.30'), ('Finance','0.30'), ('Manager','100.30'), ('Owner','1000.30')]:
        sign_in(actor)
        response = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH})
        assert response.json()['metrics'][0]['value'] == amount
        if actor != 'Owner':
            assert '外部客户' not in response.text
    sign_in('S1')
    response = client.get('/api/bi/orders', params={'source_id':str(src.id), 'month':MONTH,
        'dimension':'customer', 'key':str(customers['乙客户'].id)})
    assert response.json() == {'rows':[], 'total':0}
    assert client.get(f"/api/bi/targets/{accounts['S2'].id}", params={'month':MONTH}).status_code == 404
    sign_in('Manager')
    assert client.put(f"/api/bi/targets/{accounts['S3'].id}", params={'month':MONTH}, json={'amount':'1'}).status_code == 404
    sign_in('Finance')
    assert client.get('/api/bi/settings').status_code == 403
    assert client.get('/api/bi/people').status_code == 403
    assert client.get(f'/api/bi/reviews/{src.id}').status_code == 403


@pytest.mark.integration
def test_target_audit_and_workbench_process_date_precision(db, client, sign_in, sample, accounts):
    src, _, customers, _ = sample
    uid = accounts['S1'].id
    cid = customers['甲客户'].id
    sign_in('Admin')
    assert review(client, src).status_code == 200
    assert client.put('/api/bi/settings', json={'calendar':{'2026-09-07':False}, 'cancelled_tasks':'exclude'}).status_code == 200
    sign_in('Owner')
    for amount in ['0.30','1.00']:
        assert client.put(f'/api/bi/targets/{uid}', params={'month':MONTH}, json={'amount':amount,'remark':'测试修改'}).status_code == 200
    assert db.scalar(select(func.count()).select_from(SalesTarget)) == 1
    assert db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.activity_type == 'sales_target_update')) == 2
    db.add_all([
        Followup(customer_id=cid, owner_user_id=uid, occurred_at=NOW, interaction_method='phone', contact_result='good'),
        Followup(customer_id=cid, owner_user_id=uid, occurred_at=NOW, interaction_method='phone', contact_result='good', is_active=False),
        Task(title='due', assignee_user_id=uid, customer_id=cid, due_at=NOW-timedelta(hours=1), source_type='manual', created_by=uid),
        Task(title='done', assignee_user_id=uid, customer_id=cid, due_at=NOW-timedelta(hours=1), source_type='manual', created_by=uid, status='done', completed_at=NOW),
        Task(title='future', assignee_user_id=uid, customer_id=cid, due_at=NOW+timedelta(days=2), source_type='manual', created_by=uid),
        Task(title='cancelled', assignee_user_id=uid, customer_id=cid, due_at=NOW-timedelta(hours=1), source_type='manual', created_by=uid, status='cancelled'),
        Opportunity(customer_id=cid, owner_user_id=uid, opportunity_name='open', estimated_amount=Decimal('0.30'), probability=Decimal('0.5'), expected_close_date=date(2026,9,20)),
        ActivityLog(user_id=uid, activity_type='user_login', occurred_at=NOW),
        ActivityLog(user_id=uid, activity_type='followup_create', occurred_at=NOW),
        ActivityLog(user_id=uid, activity_type='customer_view', occurred_at=NOW-timedelta(days=1)),
    ])
    db.commit()
    sign_in('S1')
    body = client.get(f'/api/bi/workbench/{uid}', params={'month':MONTH}).json()
    m = metrics(body)
    assert m['EXEC_SALES_AMT'] == '0.30' and m['TGT_COMPLETION'] == '30.00'
    assert m['TGT_WEIGHTED_FORECAST'] == '0.45'
    assert m['CRM_EFFECTIVE_DAY'] == '1' and m['CRM_FOLLOWUP_COUNT'] == '1'
    assert m['CRM_TASK_RATE'] == '50.00' and body['overdue_tasks'] == 1
    db.add(Opportunity(customer_id=cid, owner_user_id=uid, opportunity_name='unknown probability', estimated_amount=5, expected_close_date=date(2026,9,25)))
    db.commit()
    m = metrics(client.get(f'/api/bi/workbench/{uid}', params={'month':MONTH}).json())
    assert m['OPP_WEIGHTED_AMT'] is None and m['TGT_WEIGHTED_FORECAST'] is None


@pytest.mark.integration
def test_unknown_status_staff_review_and_month_validation(db, client, sign_in, sample):
    src, _, _, add = sample
    add('unknown', '1', '2026-09-01', status='unknown', staff=None)
    db.commit()
    sign_in('Admin')
    assert review(client, src).status_code == 409
    assert review(client, src, staff_mapping_complete=False).status_code == 200
    assert review(client, src, coverage_to='2027-01-01').status_code == 422
    sign_in('Owner')
    r = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'basis':'verified'}).json()
    assert metrics(r)['EXEC_SALES_AMT'] is None
    assert client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':'2026-09-02'}).status_code == 422
    assert client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':'2027-01-01'}).status_code == 422


@pytest.mark.integration
def test_product_units_and_header_difference(db, client, sign_in, sample):
    src, _, _, add = sample
    add('甲客户', '1.00', '2026-09-07', unit='箱', line_amount='0.90')
    db.commit()
    sign_in('S1')
    r = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'dimension':'product'}).json()
    assert r['rows'][0]['quantity'] is None and r['rows'][0]['average_price'] is None
    assert r['line_difference'] == '0.10'


@pytest.mark.integration
def test_attention_thresholds_and_does_not_change_customer_state(db, client, sign_in, sample):
    src, _, customers, add = sample
    add('dormant', '1', '2026-06-10')  # 91 days
    add('lost', '1', '2026-03-13')  # 180 days
    add('boundary', '1', '2026-06-11')  # 90 days, not dormant
    add('seasonal', '1', '2025-09-05')
    db.commit()
    sign_in('Admin')
    assert review(client, src).status_code == 200
    sign_in('S1')
    response = client.get('/api/bi/attention', params={'source_id':str(src.id)})
    assert response.status_code == 200, response.text
    rows = response.json()['rows']
    assert any(r['name']=='dormant' and r['kind']=='沉睡' for r in rows)
    assert any(r['name']=='lost' and r['kind']=='疑似流失' for r in rows)
    assert not any(r['name']=='boundary' for r in rows)
    assert any(r['name']=='seasonal' and '去年同月' in r['kind'] for r in rows)
    assert all(c.lifecycle_status == 'prospect' for c in customers.values())


@pytest.mark.integration
def test_no_visible_source_does_not_leak_source_names(db, client, sign_in, accounts, sample):
    src, _, _, _ = sample
    from app.cli import create_user
    create_user(db, 'empty_sales', 'sales', 'M0-test-only-password!', 'self')
    db.commit()
    sign_in('empty_sales')
    assert client.get('/api/bi/sources').json() == []
    assert client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH}).status_code == 404


@pytest.mark.integration
def test_settings_read_redaction_and_audit(db, client, sign_in, accounts):
    sign_in('Admin')
    r = client.put('/api/bi/settings', json={'personal_calendar':{str(accounts['S2'].id):{'2026-09-07':False}}})
    assert r.status_code == 200
    assert db.get(BISetting, 1)
    assert db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.activity_type == 'bi_settings_update')) == 1
    sign_in('Manager')
    assert client.get('/api/bi/settings').status_code == 403

@pytest.mark.integration
def test_full_history_requires_historical_status_and_coverage(db, client, sign_in, sample):
    src, _, _, add = sample
    add('older unknown', '10', '2025-12-01', status='unknown')
    db.commit()
    sign_in('Admin')
    assert review(client, src).status_code == 200
    sign_in('Owner')
    report = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH, 'basis':'verified'}).json()
    assert metrics(report)['EXEC_SALES_AMT'] == '1000.30'
    assert metrics(report)['CUS_NEW_TRANSACT'] is None
    assert metrics(report)['CUS_RETURNING'] is None


@pytest.mark.integration
def test_fact_update_time_is_scoped(db, client, sign_in, sample):
    src, _, _, add = sample
    outside = add('outside newer', '1', '2026-09-08', staff='S3')
    outside.updated_at = NOW
    db.commit()
    sign_in('S1')
    report = client.get('/api/bi/sales', params={'source_id':str(src.id), 'month':MONTH}).json()
    assert datetime.fromisoformat(report['updated_at']) == NOW-timedelta(days=1)


@pytest.mark.unit
def test_metric_descriptions_match_dictionary():
    from pathlib import Path
    from app.bi_calculations import CATALOG
    rows = {}
    for line in (Path(__file__).resolve().parents[1]/'docs/04_V1指标字典.md').read_text(encoding='utf-8').splitlines():
        parts = [c.strip() for c in line.split('|')]
        if len(parts) > 7:
            rows[parts[1]] = {'definition':parts[4], 'source':parts[5]}
    for code, entry in CATALOG.items():
        if code != 'TGT_WORKDAYS_REMAINING':
            assert entry == rows[code]

@pytest.mark.integration
def test_m3_migration_preserves_configuration_on_downgrade(database_engine, monkeypatch):
    import os
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from app.config import get_settings
    schema = 'm3guard_' + uuid4().hex
    with database_engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(os.environ['DATABASE_URL']).update_query_dict({'options':f'-csearch_path={schema}'})
    monkeypatch.setenv('DATABASE_URL', url.render_as_string(hide_password=False))
    get_settings.cache_clear()
    engine = create_engine(url, hide_parameters=True)
    config = Config(str(Path(__file__).resolve().parents[1]/'apps/backend/alembic.ini'))
    try:
        command.upgrade(config, 'head')
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO bi_setting (id,value) VALUES (1, '{}')"))
        with pytest.raises(RuntimeError, match='restore a verified backup'):
            command.downgrade(config, '0004_m2')
        with engine.connect() as conn:
            from app.main import alembic_head
            assert conn.scalar(text('SELECT version_num FROM alembic_version')) == alembic_head()
            assert conn.scalar(text('SELECT count(*) FROM bi_setting')) == 1
    finally:
        engine.dispose()
        get_settings.cache_clear()
        with database_engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
