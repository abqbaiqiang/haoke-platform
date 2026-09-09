"""Create private development configuration without printing credentials."""

import argparse
import secrets
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--local", action="store_true", help="Native development: frontend 3000 / PostgreSQL 55432")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    raise SystemExit(".env already exists; refusing to overwrite secrets")
values = {
    "CHANGE_ME_DB_PASSWORD": secrets.token_hex(24),
    "CHANGE_ME_WITH_LONG_RANDOM_VALUE": secrets.token_hex(48),
    "CHANGE_ME_ADMIN_PASSWORD": secrets.token_urlsafe(24),
    "CHANGE_ME_DEMO_PASSWORD": secrets.token_urlsafe(24),
    "CHANGE_ME_TEST_DB_PASSWORD": secrets.token_hex(24),
}
content = (root / ".env.example").read_text(encoding="utf-8")
for old, new in values.items():
    content = content.replace(old, new)
if args.local:
    content = content.replace("http://localhost:8080", "http://localhost:3000").replace(
        "@postgres:5432/", "@127.0.0.1:55432/"
    )
target.write_text(content, encoding="utf-8")
for name in ("uploads/raw", "uploads/attachments", "backups", "postgres"):
    (root / "app-data" / name).mkdir(parents=True, exist_ok=True)
print("Created private .env and persistent directories. Read credentials from .env locally.")
