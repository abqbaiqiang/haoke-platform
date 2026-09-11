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
