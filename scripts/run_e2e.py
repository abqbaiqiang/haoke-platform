import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv
from e2e_fixtures import prepare

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
os.environ.setdefault("E2E_BASE_URL", os.environ["APP_BASE_URL"])
os.environ['E2E_FINANCE_FIXTURES'] = prepare(root/'.tools/e2e-fixtures')
subprocess.run(["node", "node_modules/@playwright/test/cli.js", "test"], cwd=root / "apps/frontend", check=True)
