"""Run on a dedicated M0 development/acceptance stack, never a live production stack.

Does not remove data, volumes or databases. Force-recreates service containers only.
"""

import argparse
import json
import subprocess
import uuid
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--allow-recreate", action="store_true", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]


def compose(*args):
    return subprocess.check_output(["docker", "compose", *args], cwd=root, text=True)


config = json.loads(compose("config", "--format", "json"))
if config["services"]["backend"]["environment"]["APP_ENV"] == "production":
    raise SystemExit("Use a dedicated development/acceptance stack, not production")
assert "ports" not in config["services"]["postgres"]
subprocess.run(["docker", "compose", "up", "-d", "--build", "--wait", "--wait-timeout", "180"], cwd=root, check=True)
probe = "from sqlalchemy import select; from sqlalchemy.orm import Session; from app.db import get_engine; from app.models import User; import json; db=Session(get_engine()); print(json.dumps([(str(u.id),u.username) for u in db.scalars(select(User).order_by(User.username))]))"
before = compose("exec", "-T", "backend", "python", "-c", probe).strip()
assert json.loads(before), "Bootstrap administrator missing"
marker = "m0-acceptance-" + uuid.uuid4().hex
compose(
    "exec",
    "-T",
    "backend",
    "python",
    "-c",
    f"import os; from pathlib import Path; [(Path(os.environ[d])/'{marker}').write_text('{marker}') for d in ('UPLOAD_ROOT','BACKUP_ROOT')]",
)
subprocess.run(
    [
        "docker",
        "compose",
        "up",
        "-d",
        "--force-recreate",
        "--wait",
        "--wait-timeout",
        "180",
        "postgres",
        "backend",
        "worker",
        "frontend",
        "reverse-proxy",
    ],
    cwd=root,
    check=True,
)
assert before == compose("exec", "-T", "backend", "python", "-c", probe).strip()
compose(
    "exec",
    "-T",
    "backend",
    "python",
    "-c",
    f"import os; from pathlib import Path; assert all((Path(os.environ[d])/'{marker}').read_text() == '{marker}' for d in ('UPLOAD_ROOT','BACKUP_ROOT'))",
)
compose(
    "exec",
    "-T",
    "backend",
    "python",
    "-c",
    "import urllib.request; assert urllib.request.urlopen('http://127.0.0.1:8000/health').status == 200",
)
compose(
    "exec",
    "-T",
    "backend",
    "python",
    "-c",
    f"import os; from pathlib import Path; [(Path(os.environ[d])/'{marker}').unlink() for d in ('UPLOAD_ROOT','BACKUP_ROOT')]",
)
print("PASS: Docker startup, health, account rows and uploads/backups survive container recreation.")
