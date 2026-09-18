"""V1 usage decision: owner + sales staff only; owner manages accounts in-app."""
import pytest
from sqlalchemy import func, select

from app.models import LoginSession, PermissionScope


def create_payload(username='colleague1'):
    return {'username': username, 'display_name': '同事一号', 'password': 'Safe-staff-pass-2026', 'mobile': None}


@pytest.mark.integration
def test_owner_creates_staff_and_new_account_logs_in(db, client, accounts, sign_in):
    sign_in('Owner')
    r = client.post('/api/staff', json=create_payload())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body['role_code'] == 'sales' and body['is_active'] is True
    uid = body['id']
    # Sales scope is created with the account; new account can sign in immediately.
    assert db.scalar(select(PermissionScope).where(PermissionScope.user_id == uid)).scope_type == 'self'
    client.cookies.clear()
    login = client.post('/api/auth/login', json={'username': 'colleague1', 'password': 'Safe-staff-pass-2026'})
    assert login.status_code == 200
    assert login.json()['role_code'] == 'sales'
    # New staff sees only their own (empty) overview scope, not other data.
    assert client.get('/api/crm/customers').json()['total'] == 0


@pytest.mark.integration
def test_duplicate_username_and_weak_password_rejected(db, client, accounts, sign_in):
    sign_in('Owner')
    assert client.post('/api/staff', json=create_payload(username='S1')).status_code == 409
    assert client.post('/api/staff', json=create_payload(username='同事 一号')).status_code == 422
    assert client.post('/api/staff', json={**create_payload(username='x2'), 'password': 'short'}).status_code == 422


@pytest.mark.integration
def test_owner_resets_password_and_disables_account(db, client, accounts, sign_in):
    sign_in('Owner')
    created = client.post('/api/staff', json=create_payload('colleague2')).json()
    uid = created['id']
    client.cookies.clear()
    assert client.post('/api/auth/login', json={'username': 'colleague2', 'password': 'Safe-staff-pass-2026'}).status_code == 200
    sign_in('Owner')
    # Password reset revokes the live session.
    r = client.patch(f'/api/staff/{uid}', json={'new_password': 'New-staff-pass-2026'})
    assert r.status_code == 200
    assert db.scalar(select(func.count()).select_from(LoginSession).where(
        LoginSession.user_id == uid, LoginSession.revoked_at.is_(None))) == 0
    client.cookies.clear()
    assert client.post('/api/auth/login', json={'username': 'colleague2', 'password': 'Safe-staff-pass-2026'}).status_code == 401
    assert client.post('/api/auth/login', json={'username': 'colleague2', 'password': 'New-staff-pass-2026'}).status_code == 200
    # Deactivation blocks login and hides the account from active listings.
    sign_in('Owner')
    r = client.patch(f'/api/staff/{uid}', json={'is_active': False})
    assert r.status_code == 200 and r.json()['is_active'] is False
    client.cookies.clear()
    assert client.post('/api/auth/login', json={'username': 'colleague2', 'password': 'New-staff-pass-2026'}).status_code == 401


@pytest.mark.integration
def test_staff_management_is_owner_only_and_admin_hidden(db, client, accounts, sign_in):
    sign_in('Owner')
    created = client.post('/api/staff', json=create_payload('colleague3')).json()
    listing = client.get('/api/staff').json()
    ids = [u['id'] for u in listing]
    assert created['id'] in ids
    assert all(u['role_code'] != 'admin' for u in listing)
    assert accounts['S1'].id not in ids or any(u['id'] == str(accounts['S1'].id) and u['role_code'] == 'sales' for u in listing)
    # Sales cannot list, create or modify accounts.
    sign_in('S1')
    assert client.get('/api/staff').status_code == 403
    assert client.post('/api/staff', json=create_payload('colleague4')).status_code == 403
    assert client.patch(f"/api/staff/{created['id']}", json={'is_active': False}).status_code == 403
    # Admin accounts are not manageable from this API (CLI recovery path stays).
    sign_in('Admin')
    assert client.get('/api/staff').status_code == 403
    assert client.patch(f"/api/staff/{accounts['Admin'].id}", json={'display_name': 'x'}).status_code == 403


@pytest.mark.integration
def test_owner_write_path_across_data_center_and_bi_config(db, client, accounts, sign_in):
    """The owner can now run the full day-to-day loop without an admin account."""
    sign_in('Owner')
    # CRM settings and BI settings writes
    assert client.put('/api/crm/settings', json={'sales_create_tags': True, 'followup_edit_hours': 48,
                                                 'public_pool_claim_enabled': True}).status_code == 200
    assert client.put('/api/bi/settings', json={'work_week': [0, 1, 2, 3, 4], 'calendar': {},
        'personal_calendar': {}, 'dormant_days': 90, 'lost_warning_days': 180, 'followup_days': {},
        'effective_activity_types': ['followup_create', 'task_complete'], 'cancelled_tasks': None}).status_code == 200
    # Mapping users and source creation visibility
    assert client.get('/api/data/mapping-users').status_code == 200
    # Sales staff still cannot reach any of these.
    sign_in('S1')
    assert client.get('/api/data/mapping-users').status_code == 403
    assert client.put('/api/crm/settings', json={}).status_code == 403
    assert client.put('/api/bi/settings', json={}).status_code == 403


@pytest.mark.integration
def test_null_fields_are_422_and_password_reset_is_audited(db, client, accounts, sign_in):
    from app.models import ActivityLog
    sign_in('Owner')
    created = client.post('/api/staff', json=create_payload('colleague5')).json()
    uid = created['id']
    # Explicit nulls for non-nullable fields must fail validation, not 500 or erase data.
    for body in [{'display_name': None}, {'is_active': None}, {'display_name': None, 'mobile': None}]:
        assert client.patch(f'/api/staff/{uid}', json=body).status_code == 422
    assert client.get('/api/staff').json()[0]  # list still fine
    row = next(u for u in client.get('/api/staff').json() if u['id'] == uid)
    assert row['display_name'] == '同事一号' and row['is_active'] is True
    # Password reset is recorded as an explicit action with session revocation.
    assert client.patch(f'/api/staff/{uid}', json={'new_password': 'Another-pass-2026x'}).status_code == 200
    events = db.scalars(select(ActivityLog).where(ActivityLog.activity_type == 'staff_account_update',
        ActivityLog.object_id == uid)).all()
    assert any(e.details.get('password_reset') and e.details.get('sessions_revoked') for e in events)
    # mobile may be explicitly cleared to null (nullable column).
    assert client.patch(f'/api/staff/{uid}', json={'mobile': None}).status_code == 200


@pytest.mark.integration
def test_unused_staff_account_can_be_deleted(db, client, accounts, sign_in):
    """老板 2026-09-18：不用的账号可删除；仅有业务数据的账号必须 409 引导停用。"""
    from app.models import ActivityLog, LoginSession

    sign_in('Owner')
    created = client.post('/api/staff', json=create_payload('colleague_del')).json()
    uid = created['id']
    # 登录一次产生会话；本人建号留痕存在。
    assert client.post('/api/auth/login', json={'username': 'colleague_del', 'password': create_payload('x')['password']}).status_code == 200
    assert db.scalar(select(LoginSession.user_id).where(LoginSession.user_id == uid)) is not None
    # 销售不能删除任何账号。
    sign_in('S1')
    assert client.delete(f'/api/staff/{uid}').status_code == 403
    # 有业务数据的账号拒绝删除并给出去向（S1 名下有客户归属，用现成 fixtures 不便；直接给 demo 账号造一条归属）。
    from app.data_models import Customer
    held = Customer(source_system='crm', customer_name='被持有客户', normalized_name='被持有客户',
                    owner_user_id=accounts['S1'].id, ownership_status='owned')
    db.add(held)
    db.commit()
    sign_in('Owner')
    r = client.delete(f"/api/staff/{accounts['S1'].id}")
    assert r.status_code == 409
    body = r.json()['error']['message'] if 'error' in r.json() else r.json().get('detail', '')
    assert '停用' in body and '客户归属' in body
    # 闲置账号删除成功：列表/会话/权限范围/本人留痕消失，老板留痕一次删除动作。
    assert client.delete(f'/api/staff/{uid}').status_code == 204
    assert all(u['id'] != uid for u in client.get('/api/staff').json())
    assert db.scalar(select(LoginSession.user_id).where(LoginSession.user_id == uid)) is None
    assert db.scalar(select(ActivityLog.user_id).where(ActivityLog.user_id == uid)) is None
    kinds = [e.activity_type for e in db.scalars(select(ActivityLog).where(ActivityLog.user_id == accounts['Owner'].id))]
    assert 'staff_account_delete' in kinds
    # 已删账号不可再登录，用户名可复用重建。
    assert client.post('/api/auth/login', json={'username': 'colleague_del', 'password': create_payload('x')['password']}).status_code in {401, 403}
    assert client.post('/api/staff', json=create_payload('colleague_del')).status_code == 201
    # 非销售角色（老板/管理员）不在可删范围。
    assert client.delete(f"/api/staff/{accounts['Owner'].id}").status_code == 404
    assert client.delete(f"/api/staff/{accounts['Admin'].id}").status_code == 404
