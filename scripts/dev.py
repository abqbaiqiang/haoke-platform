"""Start native services from one command. PostgreSQL and dependencies must exist."""

import os
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
load_dotenv(ROOT / ".env", override=True)
os.environ["PYTHONPATH"] = str(ROOT / "apps/backend")
os.environ["WORKER_HEARTBEAT_PATH"] = str(ROOT / "app-data/worker-heartbeat")
os.environ["UPLOAD_ROOT"] = str(ROOT / "app-data/uploads")
os.environ["NEXT_TELEMETRY_DISABLED"] = "1"
os.environ["INTERNAL_API_URL"] = os.environ.get("INTERNAL_API_URL", "http://127.0.0.1:8000")
subprocess.run([sys.executable, "-m", "alembic", "-c", "apps/backend/alembic.ini", "upgrade", "head"], check=True)
subprocess.run([sys.executable, "-m", "app.cli", "bootstrap-admin"], check=True)
commands = [
    [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--no-access-log",
        "--no-proxy-headers",
        "--reload",
    ],
    [sys.executable, "apps/worker/main.py"],
    ["node", "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", os.environ.get("FRONTEND_HOST", "127.0.0.1"), "--port", "3000"],
]
children = []
try:
    for index, command in enumerate(commands):
        children.append(subprocess.Popen(command, cwd=ROOT / "apps/frontend" if index == 2 else ROOT))
    print("M3 local services: http://localhost:3000 (Ctrl+C stops services)", flush=True)
    while all(child.poll() is None for child in children):
        time.sleep(1)
    raise RuntimeError("One service exited; stopping remaining services")
except KeyboardInterrupt:
    pass
finally:
    for child in children:
        child.terminate()
    for child in children:
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
