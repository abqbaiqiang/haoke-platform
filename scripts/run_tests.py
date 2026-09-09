"""Run native M0-M2 regression. Docker acceptance remains a separate gate."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

parser = argparse.ArgumentParser()
parser.add_argument("--e2e", action="store_true", help="Requires running dev/Compose stack and seeded demo accounts")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
os.chdir(root)
load_dotenv(root / ".env")
url = make_url(os.environ["DATABASE_URL"])
os.environ.setdefault("TEST_DATABASE_URL", url.set(database="songmao_test").render_as_string(hide_password=False))
os.environ["NEXT_TELEMETRY_DISABLED"] = "1"
os.environ.setdefault("E2E_BASE_URL", os.environ["APP_BASE_URL"])
subprocess.run([sys.executable, "-m", "ruff", "check", "apps/backend", "apps/worker", "tests", "scripts"], check=True)
subprocess.run([sys.executable, "-m", "pytest", "-q", "--tb=short"], check=True)
frontend = root / "apps/frontend"
subprocess.run(["node", "node_modules/typescript/bin/tsc", "--noEmit"], cwd=frontend, check=True)
subprocess.run(["node", "node_modules/next/dist/bin/next", "build", "--webpack"], cwd=frontend, check=True)
subprocess.run([sys.executable, "scripts/verify_bundle.py"], check=True)
if args.e2e:
    subprocess.run([sys.executable, "scripts/run_e2e.py"], check=True)
print("Requested native M0-M2 checks passed. Docker execution requires Docker acceptance.")
