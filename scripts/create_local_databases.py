"""Create only the named development and test databases on loopback PostgreSQL."""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
url = make_url(os.environ["DATABASE_URL"])
if os.environ.get("APP_ENV") != "development" or url.host not in {"localhost", "127.0.0.1"}:
    raise SystemExit("Only loopback development PostgreSQL is supported")
engine = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT", hide_parameters=True)
with engine.connect() as connection:
    for name in (url.database, "songmao_test"):
        if not name or not name.replace("_", "").isalnum():
            raise SystemExit("Invalid development database name")
        if not connection.execute(text("SELECT 1 FROM pg_database WHERE datname=:name"), {"name": name}).scalar():
            connection.execute(text(f'CREATE DATABASE "{name}"'))
print("Local development and test databases ready.")
