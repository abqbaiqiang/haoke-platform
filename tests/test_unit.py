from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.permissions import Principal, can_edit_user, can_read_owned, can_read_user
from app.security import hash_password, verify_password

pytestmark = pytest.mark.unit


def test_argon2_password_security():
    value = "M0-unit-test-password!"
    encoded = hash_password(value)
    assert encoded.startswith("$argon2id$")
    assert value not in encoded
    assert hash_password(value) != encoded
    assert verify_password(value, encoded)
    assert not verify_password("wrong", encoded)
    assert not verify_password(value, "invalid")


@pytest.mark.parametrize("password", ["short", "CHANGE_ME_WITH_A_LONG_PASSWORD", "a" * 129])
def test_weak_bootstrap_password_rejected(password):
    with pytest.raises(ValueError):
        hash_password(password)


@pytest.mark.parametrize(
    "role,scope,own,member,expected",
    [
        ("owner", "all", False, False, True),
        ("manager", "team", False, True, True),
        ("manager", "team", False, False, False),
        ("manager", "all", False, True, False),
        ("sales", "self", True, False, True),
        ("sales", "all", False, True, False),
        ("finance", "custom", False, True, True),
        ("finance", "all", False, False, False),
        ("finance", "custom", False, False, False),
        ("admin", "all", False, True, True),  # 2026-09-16 决策：admin 最高权限，等同 owner 可读
    ],
)
def test_scope_matrix(role, scope, own, member, expected):
    actor, other = uuid4(), uuid4()
    target = actor if own else other
    principal = Principal(actor, role, scope, frozenset([str(target)]) if member else frozenset())
    assert can_read_owned(principal, target) is expected


def test_admin_system_scope_and_sales_write_isolation():
    first, second = uuid4(), uuid4()
    admin = Principal(first, "admin", "custom")
    sales = Principal(first, "sales", "self")
    assert can_read_user(admin, second) and can_edit_user(admin, second)
    assert can_read_owned(admin, second)  # 2026-09-16 决策：admin 可读全部业务数据
    assert can_edit_user(sales, first) and not can_edit_user(sales, second)


@pytest.mark.parametrize(
    "override",
    [
        {"app_secret_key": "CHANGE_ME"},
        {"app_env": "production", "app_base_url": "http://example.com"},
        {"app_env": "production", "app_base_url": "http://8.8.8.8"},
        {"app_env": "production", "app_base_url": "http://nas.local"},
        {"app_base_url": "http://example.com/path"},
        {"database_url": "sqlite://"},
    ],
)
def test_configuration_fails_closed(override):
    values = {
        "app_secret_key": "test-secret-" + "x" * 32,
        "database_url": "postgresql+psycopg://test:test@localhost/test",
        "app_base_url": "https://example.com",
    }
    values.update(override)
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, **values)
    assert "input_value" not in str(error.value)


def test_production_lan_http_allowed_and_cookie_secure_follows_scheme():
    """docs/10：局域网试用允许内网 IP 走 HTTP；Cookie Secure 跟实际协议，而非环境名。"""
    values = {
        "app_secret_key": "test-secret-" + "x" * 32,
        "database_url": "postgresql+psycopg://test:test@localhost/test",
    }
    lan = Settings(_env_file=None, app_env="production", app_base_url="http://192.168.1.107:8080", **values)
    assert lan.cookie_secure is False
    public = Settings(_env_file=None, app_base_url="https://example.com", **values)
    assert public.cookie_secure is True


def test_storage_init_prepares_configured_directories(tmp_path, monkeypatch):
    """审计 P1-15：storage_init 仅准备配置的目录，并逐一 chown 10001:10001 / chmod 0700；
    2026-09-19 扩展：对 UPLOAD_ROOT/BACKUP_ROOT 内的外部迁入内容递归自愈属主（不递归 chmod）。"""
    import os
    import runpy
    from pathlib import Path

    chown_calls, chmod_calls = [], []
    # os.chown 在 Windows 上不存在，统一打桩以便跨平台验证调用序列。
    monkeypatch.setattr(os, 'chown', lambda path, uid, gid: chown_calls.append((path, uid, gid)), raising=False)
    monkeypatch.setattr(Path, 'chmod', lambda self, mode: chmod_calls.append((self, mode)))
    upload, backup = tmp_path / 'upload', tmp_path / 'backup'
    # 模拟外部迁入的错误属主内容：嵌套目录与文件（属主值任意，断言只看被 chown 的路径全集）。
    migrated_dir = upload / 'migrated-batch'
    migrated_dir.mkdir(parents=True)
    (migrated_dir / 'img.png').write_bytes(b'x')
    monkeypatch.setenv('UPLOAD_ROOT', str(upload))
    monkeypatch.setenv('BACKUP_ROOT', str(backup))
    script = Path(__file__).resolve().parents[1] / 'apps/backend/app/storage_init.py'
    runpy.run_path(str(script))
    assert (upload / 'raw').is_dir() and (upload / 'attachments').is_dir() and backup.is_dir()
    assert (upload / 'followups').is_dir()
    expected = [upload, upload / 'raw', upload / 'attachments', upload / 'followups', backup]
    chowned = {path for path, _, _ in chown_calls}
    assert chowned == set(expected) | {migrated_dir, migrated_dir / 'img.png'}
    assert {uid for _, uid, _ in chown_calls} == {10001} and {gid for _, _, gid in chown_calls} == {10001}
    assert [path for path, _ in chmod_calls] == expected and {mode for _, mode in chmod_calls} == {0o700}
