"""2026-09-16 决策：admin 为最高权限角色，可读全部业务数据（等同 owner）。
四处范围实现（permissions/crm_service/bi_service/import_api）必须给出一致结果。"""
from datetime import datetime
from uuid import UUID

from app.permissions import Principal, can_read_owned


def test_can_read_owned_admin_full_access():
    p = Principal(UUID(int=1), 'admin', 'custom', frozenset())
    assert can_read_owned(p, UUID(int=2))


def test_admin_reads_bi_crm_and_data_like_owner(db, client, accounts, sign_in):
    from tests.test_sales_workspace import _perf_source
    now = datetime.now(__import__('app').crm_service.TZ)
    src, c = _perf_source(db, accounts, [(now.date(), 8000)])
    sign_in('Admin')
    # BI：此前 admin 被 403，现应与 owner 一致
    r = client.get('/api/bi/sales', params={'source_id': str(src.id), 'month': '2026-09-01'})
    assert r.status_code == 200, r.text
    assert r.json()['metrics'][0]['value'] == '8000.00'
    # BI 风险提醒
    assert client.get('/api/bi/attention', params={'source_id': str(src.id)}).status_code == 200
    # CRM 客户（此前已允许，回归确认）
    assert client.get('/api/crm/customers').status_code == 200
    # 数据中心口径（scoped_sales 此前 admin 被 403）
    r = client.get('/api/data/sales/orders', params={'source_id': str(src.id), 'month': '2026-09'})
    assert r.status_code == 200, r.text
