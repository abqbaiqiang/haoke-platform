import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from e2e_fixtures import prepare

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
# E2E 会清空 sys_login_throttle 并改写业务数据，仅在 development 环境允许（审计 P2-28）。
if os.environ.get("APP_ENV") != "development":
    sys.exit(f"run_e2e.py 拒绝运行：APP_ENV={os.environ.get('APP_ENV') or '(未设置)'}，仅 development 环境允许执行 E2E")
os.environ.setdefault("E2E_BASE_URL", os.environ["APP_BASE_URL"])
# 重复运行会触发登录限流（15 分钟锁），e2e 开始前清空节流记录，保证用例确定性。
sys.path.insert(0, str(root / "apps" / "backend"))  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402


def clear_login_throttle():
    engine = create_engine(os.environ["DATABASE_URL"], connect_args={"connect_timeout": 5})
    try:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM sys_login_throttle"))
    except OperationalError:
        # CI 宿主机直连不了 compose 内网 postgres（未发布端口，符合"DB 不对公网开放"），
        # 经 backend 容器在容器内执行同样的清理。本地开发仍走直连。
        script = (
            "from sqlalchemy import create_engine, text\n"
            "engine = create_engine(__import__('os').environ['DATABASE_URL'])\n"
            "with engine.begin() as connection:\n"
            "    connection.execute(text('DELETE FROM sys_login_throttle'))\n"
            "engine.dispose()\n"
        )
        subprocess.run(["docker", "compose", "exec", "-T", "backend", "python", "-c", script],
                       check=True, cwd=root)
    finally:
        engine.dispose()


clear_login_throttle()
os.environ['E2E_FINANCE_FIXTURES'] = prepare(root/'.tools/e2e-fixtures')
subprocess.run(["node", "node_modules/@playwright/test/cli.js", "test"], cwd=root / "apps/frontend", check=True)
