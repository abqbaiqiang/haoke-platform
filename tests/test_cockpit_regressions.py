"""Regression coverage for reviewed customer analytics and cockpit changes."""
# ruff: noqa: F401, F811
import pytest
from datetime import timedelta
from decimal import Decimal

from app.data_models import Customer
from test_m3 import NOW, sample, review


def test_real_binding_is_counted(db, client, accounts, sign_in, sample):
    src, _, customers, _ = sample
    target = customers['乙客户']
    target.owner_user_id = accounts['S1'].id
    prospect = Customer(source_system='crm', customer_name='审查绑定潜客', normalized_name='审查绑定潜客',
        owner_user_id=accounts['S1'].id, crm_managed=True, created_at=NOW-timedelta(days=10))
    db.add(prospect)
    db.commit()
    sign_in('Owner')
    response = client.post(f'/api/crm/customers/{prospect.id}/bind', json={'target_id': str(target.id)})
    assert response.status_code == 200, response.text
    assert review(client, src).status_code == 200
    result = client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()
    assert result['conversion_counted'] == 1, result['conversion_counted']


def test_repeat_formula_does_not_change_with_rfm(db, client, accounts, sign_in, sample):
    src, _, _, _ = sample
    sign_in('Owner')
    assert review(client, src).status_code == 200
    before = client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()['trend'][-1]['repeat_rate']
    assert client.put('/api/bi/settings', json={'rfm_freq_orders': 4}).status_code == 200
    after = client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()['trend'][-1]['repeat_rate']
    assert before == after, (before, after)


def test_aov_deducts_reviewed_returns(db, client, accounts, sign_in, sample):
    src, _, _, add = sample
    add('乙客户', '50.00', '2026-09-05', 'S2', status='returned')
    db.commit()
    sign_in('Owner')
    assert review(client, src, return_statuses=['returned']).status_code == 200
    row = client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()['trend'][-1]
    # Existing sample: September normal sales 1000.30 / 4 orders; return deducts 50.00.
    assert Decimal(row['amount']) == Decimal('950.30'), row
    assert Decimal(row['aov']) == Decimal('237.58'), row


@pytest.mark.parametrize('role,total,status', [('Owner',3,200),('Manager',2,200),('S1',1,200),('Finance',1,200),('Admin',None,403)])
def test_customer_analytics_all_roles(db, client, accounts, sign_in, sample, role, total, status):
    src, _, _, _ = sample
    sign_in(role)
    response = client.get(f'/api/bi/customer-analytics?source_id={src.id}')
    assert response.status_code == status
    if status == 200:
        assert response.json()['total'] == total


def test_cockpit_contributions_and_ranking_deduct_returns(db, client, accounts, sign_in, sample):
    src, _, customers, add = sample
    add('乙客户', '50.00', '2026-09-05', 'S2', status='return')
    db.commit()
    sign_in('Owner')
    assert review(client, src).status_code == 200
    body = client.get(f'/api/bi/overview?source_id={src.id}').json()
    row = next(r for r in body['customer_contributions'] if r['customer_id'] == str(customers['乙客户'].id))
    assert row['amount'] == '50.00' and row['orders'] == 1
    rank = next(r for r in body['person_ranking'] if r['user_id'] == str(accounts['S2'].id))
    assert rank['amount'] == '50.00'
    assert body['customer_trend'][-1]['value'] == '3'
    sign_in('S1')
    body = client.get(f'/api/bi/overview?source_id={src.id}').json()
    assert body['customer_contributions'] == [] and body['person_ranking'] == []
    assert body['customer_trend'][-1]['value'] == '1'


def test_conversion_uses_reviewed_valid_orders_and_current_owner(db, client, accounts, sign_in, sample):
    src, _, customers, add = sample
    target = customers['乙客户']
    prospect = Customer(source_system='crm', customer_name='历史潜客', normalized_name='历史潜客',
        owner_user_id=accounts['S1'].id, bound_customer_id=target.id, is_active=False,
        created_at=NOW-timedelta(days=10))
    db.add(prospect)
    add('乙客户','1.00','2026-08-31','S2',status='void')
    add('乙客户','1.00','2026-09-01','S2',status='return')
    add('乙客户','1.00','2026-09-15','S2')
    db.commit()
    sign_in('Owner')
    assert review(client,src).status_code == 200
    body=client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()
    assert body['conversion_average_days'] == '4.00'
    assert client.get(f'/api/bi/customer-profile/{target.id}').json()['convert_days'] == 4
    sign_in('S1')
    assert client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()['conversion_counted'] == 0
    assert client.get(f'/api/bi/customer-profile/{target.id}').status_code == 404
    sign_in('S2')
    assert client.get(f'/api/bi/customer-analytics?source_id={src.id}').json()['conversion_counted'] == 1
