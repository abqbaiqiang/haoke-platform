"""Create a PostgreSQL custom-format backup of the local development database."""
import argparse
import os
import subprocess
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--pg-dump', required=True, type=Path)
args = parser.parse_args()
if not args.pg_dump.is_file():
    raise SystemExit('pg_dump executable not found; use a full PostgreSQL client installation.')
load_dotenv(ROOT/'.env')
url = make_url(os.environ['DATABASE_URL'])
if url.host not in {'localhost', '127.0.0.1'} or os.environ.get('APP_ENV') != 'development':
    raise SystemExit('This helper is restricted to the local development database.')
target = ROOT/'app-data/backups'/f'local-{datetime.now():%Y%m%d-%H%M%S}.dump'
target.parent.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, PGHOST=url.host, PGPORT=str(url.port or 5432), PGUSER=url.username,
           PGPASSWORD=url.password, PGDATABASE=url.database)
with target.open('xb') as output:
    subprocess.run([str(args.pg_dump.resolve()), '-Fc', '--no-owner', '--no-acl'],
                   env=env, stdout=output, check=True)
print(f'Backup created: {target}')
