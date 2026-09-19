from pathlib import Path

import pytest
import yaml

pytestmark = pytest.mark.unit
ROOT = Path(__file__).resolve().parents[1]


def test_compose_security_persistence_and_health_contract():
    config = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    services = config["services"]
    assert {"frontend", "backend", "worker", "postgres", "reverse-proxy", "migrate"} <= services.keys()
    for name in ("postgres", "backend", "worker", "frontend"):
        assert "ports" not in services[name]
        assert "healthcheck" in services[name]
        assert services[name]["logging"]["options"]["max-size"] == "10m"
    assert config["networks"]["internal"]["internal"] is True
    assert any("/var/lib/postgresql" in value for value in services["postgres"]["volumes"])
    assert any("uploads" in value for value in services["backend"]["volumes"])
    assert any("backups" in value for value in services["backend"]["volumes"])
    assert services["backend"]["depends_on"]["migrate"]["condition"] == "service_completed_successfully"
    assert services["backend"]["depends_on"]["storage-init"]["condition"] == "service_completed_successfully"
    assert services["storage-init"]["user"] == "0:0"
    assert services["storage-init"]["restart"] == "no"


def test_frontend_has_no_server_secrets():
    source = ROOT / "apps/frontend/app"
    assert source.exists()
    for path in source.rglob("*"):
        if path.is_file():
            # app/ 下有二进制静态资源（如 icon.png），按字节扫描避免 UTF-8 解码失败。
            content = path.read_bytes()
            assert b"APP_SECRET_KEY" not in content
            assert b"DATABASE_URL" not in content
            # 会话令牌名不得出现在前端源码中；“记住账号”仅持久化用户名，属允许范围。
            assert b"songmao_session" not in content
