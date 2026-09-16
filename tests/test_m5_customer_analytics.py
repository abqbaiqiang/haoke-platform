"""M5 customer analytics: RFM layers, repeat rate, conversion cycle and AOV on fixed samples."""
from datetime import timedelta

import pytest

from app.data_models import Customer
from test_m3 import NOW, sample  # noqa: F401  (fixture re-export)


def by_code(body, code):
    return next(m for m in body['metrics'] if m['code'] == code)


def segment(body, layer):
    return next(s for s in body['segments'] if s['layer'] == layer)


@pytest.mark.integration
def test_rfm_layers_repeat_and_aov_on_reviewed_history(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, customers, _ = sample
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    assert body['verified'] is True and body['through'] == '2026-09-09'
    # Fixed sample: 甲 3 orders 0.40 (S1), 乙 1 order 100.00 (S2), 外部 1 order 900.00 (S3).
    assert by_code(body, 'SALE_CUSTOMER_COUNT')['value'] == '3'
    assert by_code(body, 'CUS_PERIOD_REPEAT')['value'] == '33.33'
    assert by_code(body, 'SALE_AOV')['value'] == '250.08'  # Current month: 1000.30 / 4 orders
    # Average customer amount is 333.47: only 外部 (900.00) is M高; 甲 is frequent but small.
    assert segment(body, '一般价值客户')['count'] == 1 and segment(body, '一般价值客户')['amount'] == '0.40'
    assert segment(body, '重要发展客户')['count'] == 1 and segment(body, '重要发展客户')['amount'] == '900.00'
    assert segment(body, '一般发展客户')['count'] == 1 and segment(body, '一般发展客户')['amount'] == '100.00'
    assert segment(body, '重要价值客户')['count'] == 0
    assert body['total'] == 3
    # Top list is ranked by amount and carries per-customer RFM facts.
    assert body['top'][0]['name'] == '外部客户' and body['top'][0]['layer'] == '重要发展客户'
    assert body['top'][2]['name'] == '甲客户' and body['top'][2]['orders'] == 3
    assert body['top'][2]['aov'] == '0.13'
    # September trend: 4 orders 1000.30 over 3 customers, one of them with 2+ orders.
    september = body['trend'][-1]
    assert september['month'] == '2026-09-01' and september['orders'] == 4
    assert september['amount'] == '1000.30' and september['repeat_rate'] == '33.33'
    assert september['aov'] == '250.08'
    # Conversion has no countable prospects in this sample.
    assert by_code(body, 'CUS_CONVERT_CYCLE')['reason'] == '暂无可统计的潜客转化样本'
    assert body['conversion_counted'] == 0


@pytest.mark.integration
def test_unreviewed_source_defaults_to_verified_and_review_overrides(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    sign_in('Owner')
    # 导入即认可：未保存核实结论时，客户分析默认按已确认销售历史计算。
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    assert body['verified'] is True and body['basis'] == '已确认销售历史'
    assert body['total'] == 3
    # 显式保存的核实结论覆盖默认口径：有效状态不含数据中的状态时回到描述性口径。
    from test_m3 import review
    assert review(client, source, valid_statuses=['未使用状态'], coverage_from='2026-01-01',
                  coverage_to='2026-09-09').status_code == 200
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    assert body['verified'] is False and body['basis'] == '源销售核对（未确认口径）'
    assert body['warnings'] and any('状态' in w for w in body['warnings'])
    assert body['total'] == 3  # computed descriptively, never silently withheld


@pytest.mark.integration
def test_sales_scope_limits_analytics_to_own_customers(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    sign_in('S2')
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    assert body['total'] == 1 and body['top'][0]['name'] == '乙客户'
    # Alone in scope, 乙 becomes the average and lands in 重要发展 (R高F低M高).
    assert body['top'][0]['layer'] == '重要发展客户'
    sign_in('S1')
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    assert body['total'] == 1 and body['top'][0]['name'] == '甲客户'
    assert body['top'][0]['layer'] == '重要价值客户'  # only customer: R高F高M高 by definition


@pytest.mark.integration
def test_profile_access_control_and_cross_tenant_404(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, customers, _ = sample
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    sign_in('S1')
    r = client.get(f'/api/bi/customer-profile/{customers["甲客户"].id}')
    assert r.status_code == 200, r.text
    body = r.json()
    # Within S1's own scope 甲 is the only customer, so it benchmarks as R高F高M高.
    assert body['layer'] == '重要价值客户' and body['orders'] == 3 and body['amount'] == '0.40'
    assert body['is_repeat'] is True and body['aov'] == '0.13' and body['days_since'] == 7
    # S1 must not read another salesperson's customer profile.
    other = client.get(f'/api/bi/customer-profile/{customers["外部客户"].id}')
    assert other.status_code == 404, other.text
    # Owner's company-wide benchmark matches the analytics page: 甲 is 一般价值客户 there.
    sign_in('Owner')
    owner_view = client.get(f'/api/bi/customer-profile/{customers["甲客户"].id}').json()
    assert owner_view['layer'] == '一般价值客户'


@pytest.mark.integration
def test_conversion_cycle_from_bound_prospect(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, customers, _ = sample
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    # 乙客户 first deal is 2026-09-03; prospect created 2026-08-30 → 4 days.
    prospect = Customer(source_system='crm', customer_name='潜客转化样本', normalized_name='潜客转化样本',
        owner_user_id=accounts['S1'].id, last_import_batch_id=None, crm_managed=True,
        created_at=NOW - timedelta(days=10))
    prospect.bound_customer_id = customers['乙客户'].id
    db.add(prospect)
    db.commit()
    sign_in('Owner')
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    assert body['conversion_counted'] == 1
    assert body['conversion_average_days'] == '4.00'
    assert next(b for b in body['conversion_buckets'] if b['label'] == '4-7天成交')['count'] == 1
    profile = client.get(f'/api/bi/customer-profile/{prospect.id}').json()
    assert profile['convert_days'] == 4 and profile['layer'] == '一般发展客户'


@pytest.mark.integration
def test_rfm_thresholds_are_configurable(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, _, _ = sample
    from test_m3 import review
    sign_in('Owner')
    assert review(client, source).status_code == 200
    r = client.put('/api/bi/settings', json={'rfm_recent_days': 3, 'rfm_freq_orders': 4})
    assert r.status_code == 200, r.text
    assert r.json()['rfm_recent_days'] == 3 and r.json()['rfm_freq_orders'] == 4
    body = client.get(f'/api/bi/customer-analytics?source_id={source.id}').json()
    # With R≤3 days nobody is "recent" (last orders are 5-7 days before NOW), F needs 4+ orders.
    assert segment(body, '重要挽留客户')['count'] == 1  # 外部: R低F低M高
    assert segment(body, '一般挽留客户')['count'] == 2
    assert by_code(body, 'CUS_RFM_LAYER')['value'] == '0'
    invalid = client.put('/api/bi/settings', json={'rfm_freq_orders': 0})
    assert invalid.status_code == 422


@pytest.mark.integration
def test_crm_customer_level_filter(db, client, accounts, sign_in, sample):  # noqa: F811
    source, _, customers, _ = sample
    customers['甲客户'].customer_level = 'A'
    customers['乙客户'].customer_level = 'B'
    db.commit()
    sign_in('Owner')
    def names(body):
        return [r['customer_name'] for r in body['rows']]
    all_rows = client.get('/api/crm/customers').json()
    assert {'甲客户', '乙客户'} <= set(names(all_rows))
    a_only = client.get('/api/crm/customers?level=A').json()
    assert names(a_only) == ['甲客户']
    unlevelled = client.get('/api/crm/customers?level=none').json()
    assert '甲客户' not in names(unlevelled) and '乙客户' not in names(unlevelled)
    assert client.get('/api/crm/customers?level=X').status_code == 422
