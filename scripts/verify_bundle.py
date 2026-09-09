"""Check real configured secrets and build sentinels never reach browser assets."""

import os
from pathlib import Path

from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
values = {**dotenv_values(root / ".env"), **os.environ}
keys = [
    "APP_SECRET_KEY",
    "POSTGRES_PASSWORD",
    "INITIAL_ADMIN_PASSWORD",
    "DEMO_PASSWORD",
    "TEST_DB_PASSWORD",
    "AI_API_KEY",
    "JINGDOUYUN_APP_SECRET",
]
secrets = [values[key].encode() for key in keys if values.get(key) and len(values[key]) >= 8]
assets = list((root / "apps/frontend/.next/static").rglob("*.js"))
if not assets:
    raise SystemExit("Build frontend before checking browser assets")
for asset in assets:
    content = asset.read_bytes()
    if any(value in content for value in secrets):
        raise SystemExit("FAIL: a configured secret appeared in browser assets")
print(f"PASS: {len(assets)} browser JavaScript assets contain no configured secrets")
