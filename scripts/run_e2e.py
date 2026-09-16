import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from e2e_fixtures import prepare

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
os.environ.setdefault("E2E_BASE_URL", os.environ["APP_BASE_URL"])
# 重复运行会触发登录限流（15 分钟锁），e2e 开始前清空节流记录，保证用例确定性。
sys.path.insert(0, str(root / "apps" / "backend"))  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

engine = create_engine(os.environ["DATABASE_URL"])
with engine.begin() as connection:
    connection.execute(text("DELETE FROM sys_login_throttle"))
engine.dispose()
os.environ['E2E_FINANCE_FIXTURES'] = prepare(root/'.tools/e2e-fixtures')
subprocess.run(["node", "node_modules/@playwright/test/cli.js", "test"], cwd=root / "apps/frontend", check=True)
