"""Local dev backend launcher (single uvicorn process, no reload).

Usage: .venv/Scripts/python.exe scripts/dev_backend.py
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env", override=True)
os.environ.setdefault("WORKER_HEARTBEAT_PATH", str(ROOT / "app-data/worker-heartbeat"))
os.environ.setdefault("UPLOAD_ROOT", str(ROOT / "app-data/uploads"))
os.environ.setdefault("INTERNAL_API_URL", "http://127.0.0.1:8000")
sys.path.insert(0, str(ROOT / "apps/backend"))

if os.environ.get("APP_ENV") != "development":
    raise SystemExit("仅 development 环境允许启动开发后端")

import uvicorn  # noqa: E402

uvicorn.run("app.main:app", host="127.0.0.1", port=8000, access_log=False, proxy_headers=False)
