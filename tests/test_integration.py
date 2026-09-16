from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.models import ActivityLog, LoginSession, PermissionScope, User, utcnow

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("name", ["Owner", "Manager", "S1", "Finance", "Admin"])
def test_five_roles_login_logout(client, sign_in, name, db):
    response = sign_in(name)
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert "password_hash" not in response.text
    assert client.get("/api/auth/me").json()["user"]["username"] == name
    token = client.cookies.get("songmao_session")
    stored = db.scalar(select(LoginSession).where(LoginSession.token_hash.is_not(None)))
    assert stored.token_hash != token
    assert client.post("/api/auth/logout").status_code == 204
    client.cookies.set("songmao_session", token)
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize(
    "name,password", [("S1", "wrong"), ("Disabled", "M0-test-only-password!"), ("Missing", "wrong")]
)
def test_invalid_login(client, accounts, name, password):
    response = client.post("/api/auth/login", json={"username": name, "password": password})
    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_rate_limit(client, accounts):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "S1", "password": "wrong"}).status_code == 401
    assert (
        client.post("/api/auth/login", json={"username": "S1", "password": "M0-test-only-password!"}).status_code == 429
    )


@pytest.mark.parametrize(
    "role,expected", [("Owner", 200), ("Manager", 403), ("S1", 403), ("Finance", 403), ("Admin", 403)]
)
def test_owner_only(client, sign_in, role, expected):
    sign_in(role)
    assert client.get("/api/owner/status").status_code == expected


@pytest.mark.parametrize(
    "actor,target,expected",
    [
        ("Owner", "S3", 200),
        ("Manager", "S1", 200),
        ("Manager", "S3", 404),
        ("S1", "S1", 200),
        ("S1", "S2", 404),
        ("Finance", "S1", 200),
        ("Finance", "S2", 404),
        ("Admin", "S3", 200),
    ],
)
def test_resource_data_scopes(client, sign_in, accounts, actor, target, expected):
    sign_in(actor)
    assert client.get(f"/api/users/{accounts[target].id}").status_code == expected


def test_sales_cannot_read_or_modify_other_user(client, sign_in, accounts, db):
    sign_in("S1")
    for target in [accounts["S2"].id, uuid4()]:
        url = f"/api/users/{target}"
        assert client.get(url).status_code == 404
        assert client.patch(url, json={"mobile": "123"}).status_code == 404
    db.refresh(accounts["S2"])
    assert accounts["S2"].mobile is None
    own = f"/api/users/{accounts['S1'].id}"
    assert client.patch(own, json={"mobile": "123"}).status_code == 200
    assert db.scalar(select(ActivityLog).where(ActivityLog.activity_type == "user_profile_update"))
    assert client.patch(own, json={"role_code": "owner"}).status_code == 422


def test_disabled_and_expired_sessions(client, sign_in, accounts, db):
    sign_in("S1")
    accounts["S1"].is_active = False
    db.commit()
    assert client.get("/api/auth/me").status_code == 401
    accounts["S1"].is_active = True
    db.commit()
    sign_in("S2")
    session = db.scalar(select(LoginSession).where(LoginSession.user_id == accounts["S2"].id))
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_origin_csrf_validation_and_safe_error(client, sign_in):
    sign_in("S1")
    assert client.post("/api/auth/logout", headers={"origin": "https://evil.example"}).status_code == 403
    client.headers.pop("origin")
    assert client.post("/api/auth/logout").status_code == 403
    response = client.post(
        "/api/auth/login",
        headers={"origin": "http://testserver"},
        json={"username": "S1", "password": "sensitive" * 200},
    )
    assert response.status_code == 422
    assert "sensitive" not in response.text
    assert response.json()["error"]["request_id"]


def test_no_secrets_in_logs(client, sign_in, caplog):
    import logging

    caplog.set_level(logging.INFO, logger="songmao")
    sign_in("S1")
    token = client.cookies.get("songmao_session")
    client.get("/api/auth/me?secret=must-not-log")
    assert "M0-test-only-password!" not in caplog.text
    assert token not in caplog.text
    assert "must-not-log" not in caplog.text


def test_health_and_schema(db, client):
    assert client.get("/health").status_code == 200
    from app.main import alembic_head
    assert db.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == alembic_head()
    tables = set(inspect(db.bind).get_table_names())
    assert {"sys_user", "sys_permission_scope", "sys_session", "activity_log", "sys_login_throttle"} <= tables
    assert {"customer", "sales_order", "import_batch"} <= tables
    assert {"crm_task", "crm_followup", "crm_opportunity", "customer_assignment_history", "customer_claim"} <= tables


def test_bootstrap_idempotent_and_unique_username(db, accounts):
    from app.cli import create_user

    original = accounts["S1"]
    assert create_user(db, "S1", "owner", "another-test-password!", "all").id == original.id
    assert original.role_code == "sales"
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(User(username="S1", display_name="duplicate", role_code="sales", password_hash="x"))
        db.flush()


def test_user_history_foreign_keys_prevent_deletion(db, accounts):
    with pytest.raises(IntegrityError), db.begin_nested():
        db.delete(accounts["S1"])
        db.flush()


def test_demo_seed_forbidden_in_production(db, monkeypatch):
    from app.cli import seed_demo
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "app_env", "production")
    with pytest.raises(ValueError, match="forbidden"):
        seed_demo(db)


def test_scope_revocation_takes_effect_during_session(db, client, sign_in, accounts):
    sign_in("Manager")
    scope = db.scalar(select(PermissionScope).where(PermissionScope.user_id == accounts["Manager"].id))
    scope.scope_value = {"user_ids": []}
    db.commit()
    assert client.get(f"/api/users/{accounts['S1'].id}").status_code == 404


def test_session_rotation_invalidates_previous_cookie(client, sign_in):
    sign_in("S1")
    previous = client.cookies.get("songmao_session")
    assert (
        client.post("/api/auth/login", json={"username": "S1", "password": "M0-test-only-password!"}).status_code == 200
    )
    assert client.cookies.get("songmao_session") != previous
    client.cookies.clear()
    client.cookies.set("songmao_session", previous)
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("role", ["Owner", "Manager", "Finance"])
def test_read_scope_does_not_grant_user_write(client, sign_in, accounts, role):
    sign_in(role)
    assert client.patch(f"/api/users/{accounts['S1'].id}", json={"mobile": "forbidden"}).status_code == 404


def test_migration_roundtrip_in_separate_empty_schema(database_engine):
    import os
    from alembic import command
    from alembic.config import Config
    from pathlib import Path
    from app.config import get_settings

    original = os.environ["DATABASE_URL"]
    schema = "m0roundtrip_" + uuid4().hex
    with database_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    from sqlalchemy.engine import make_url

    url = make_url(original).update_query_dict({"options": f"-csearch_path={schema}"})
    os.environ["DATABASE_URL"] = url.render_as_string(hide_password=False)
    get_settings.cache_clear()
    config = Config(str(Path(__file__).resolve().parents[1] / "apps/backend/alembic.ini"))
    try:
        command.upgrade(config, "head")
        command.check(config)
        command.downgrade(config, "base")
        command.upgrade(config, "head")
        command.check(config)
    finally:
        os.environ["DATABASE_URL"] = original
        get_settings.cache_clear()
        with database_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
