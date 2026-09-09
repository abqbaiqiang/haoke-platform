"""M0 worker lifecycle and database heartbeat; no business jobs enabled."""

import json
import os
import signal
import threading
from pathlib import Path

from sqlalchemy import text

from app.db import get_engine

stop = threading.Event()
signal.signal(signal.SIGTERM, lambda *_: stop.set())
signal.signal(signal.SIGINT, lambda *_: stop.set())
heartbeat = Path(os.environ.get("WORKER_HEARTBEAT_PATH", "/tmp/worker-heartbeat"))
while not stop.is_set():
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        heartbeat.touch()
        print(json.dumps({"event": "worker_heartbeat", "status": "ready", "jobs_enabled": False}), flush=True)
    except Exception:
        print(json.dumps({"event": "worker_heartbeat", "status": "database_unavailable"}), flush=True)
    stop.wait(30)
