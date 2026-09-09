"""Restore an offline local PostgreSQL snapshot into an isolated temporary instance.

Never stops or changes the existing development server. This is a native restore
exercise, not Docker or cross-version migration acceptance.
"""
import argparse
import hashlib
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
TABLES = ('sys_user', 'customer', 'product', 'sales_order', 'sales_order_line',
          'import_batch', 'raw_import_row', 'financial_period', 'financial_metric_monthly')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--port', type=int, default=55434)
    args = parser.parse_args()
    snapshot = args.snapshot.resolve()
    backup_root = (ROOT/'app-data/backups').resolve()
    if not snapshot.is_relative_to(backup_root) or not (snapshot/'PG_VERSION').is_file():
        raise SystemExit('Use an offline snapshot directory within this project app-data/backups.')
    executable = (args.pg_bin/('pg_ctl.exe' if os.name == 'nt' else 'pg_ctl')).resolve()
    if not executable.is_file() or not 1024 <= args.port <= 65535:
        raise SystemExit('PostgreSQL binary directory or isolated port is invalid.')
    load_dotenv(ROOT/'.env')
    url = make_url(os.environ['DATABASE_URL'])
    if (url.host not in {'127.0.0.1', 'localhost'} or os.environ.get('APP_ENV') != 'development'
            or args.port == (url.port or 5432)):
        raise SystemExit('Only a separate local port in development is permitted.')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', args.port))

    temp_root = Path(tempfile.gettempdir()).resolve()
    if os.name == 'nt':
        # Inherit the user's TEMP ACL; Python's 0700 mkdtemp ACL blocks PostgreSQL's restricted token.
        workspace = temp_root/f'songmao-restore-{uuid4().hex}'
        workspace.mkdir()
    else:
        workspace = Path(tempfile.mkdtemp(prefix='songmao-restore-', dir=temp_root)).resolve()
    data = workspace/'data'
    engine = None
    stopped = False
    started = time.monotonic()
    report = {'started_at': datetime.now(timezone.utc).isoformat(), 'snapshot': snapshot.name,
              'port': args.port, 'scope': 'native offline snapshot restore only'}
    try:
        shutil.copytree(snapshot, data)
        # PostgreSQL inherits pg_ctl output handles on Windows; file handles avoid a pipe waiting for server exit.
        with (workspace/'startup.log').open('wb') as startup_log:
            launch = subprocess.run([str(executable), '-D', str(data), '-l', str(workspace/'postgres.log'),
                                     '-o', f'-h 127.0.0.1 -p {args.port}', '-w', 'start'],
                                    stdout=startup_log, stderr=subprocess.STDOUT)
        if launch.returncode:
            shutil.copy2(workspace/'startup.log', ROOT/'app-data/m1-restore-startup.log')
            if (workspace/'postgres.log').is_file():
                shutil.copy2(workspace/'postgres.log', ROOT/'app-data/m1-restore-postgres.log')
            raise RuntimeError('Restore startup failed; inspect the private m1-restore logs in app-data.')
        engine = create_engine(url.set(host='127.0.0.1', port=args.port), hide_parameters=True)
        with engine.connect() as db:
            report['migration'] = db.scalar(text('SELECT version_num FROM alembic_version'))
            assert report['migration'] == '0002_m1', 'Snapshot is not the expected M1 version'
            report['counts'] = {table: db.scalar(text(f'SELECT count(*) FROM {table}')) for table in TABLES}
            report['sales_monthly'] = [dict(row) for row in db.execute(text(
                "SELECT to_char(order_date, 'YYYY-MM') AS month, count(*) AS orders, "
                "sum(sales_amount)::text AS amount FROM sales_order GROUP BY 1 ORDER BY 1")).mappings()]
            report['upload_files_verified'] = 0
            upload_root = (ROOT/'app-data/uploads').resolve()
            for row in db.execute(text('SELECT storage_path, file_hash FROM import_batch')).mappings():
                original = (upload_root/row['storage_path']).resolve()
                assert original.is_relative_to(upload_root) and original.is_file(), 'Referenced upload missing'
                assert hashlib.sha256(original.read_bytes()).hexdigest() == row['file_hash'], 'Upload hash mismatch'
                report['upload_files_verified'] += 1
        expected_file = ROOT/'app-data/m1-local-acceptance.json'
        if expected_file.is_file():
            expected = json.loads(expected_file.read_text(encoding='utf-8'))
            for table, count in expected['counts'].items():
                assert report['counts'][table] == count, 'Restored sample count differs from acceptance record'
            assert report['counts']['sys_user'] == expected['account_count_after_migration']
            from decimal import Decimal
            by_month = {r['month']: r for r in expected['sales']['rows']}
            assert len(by_month) == len(report['sales_monthly'])
            for row in report['sales_monthly']:
                assert row['orders'] == by_month[row['month']]['orders']
                assert Decimal(row['amount']) == Decimal(by_month[row['month']]['amount'])
        report['result'] = 'passed'
    finally:
        if engine is not None:
            engine.dispose()
        if (data/'PG_VERSION').is_file():
            state = subprocess.run([str(executable), '-D', str(data), 'status'], capture_output=True)
            if state.returncode == 0:
                stopped = subprocess.run([str(executable), '-D', str(data), '-m', 'fast', '-w', 'stop']).returncode == 0
            elif state.returncode == 3:
                stopped = True
        else:
            stopped = True
        # Never delete a running instance or any directory outside our generated temporary path.
        if stopped and workspace.parent == temp_root and workspace.name.startswith('songmao-restore-'):
            shutil.rmtree(workspace)
        else:
            raise RuntimeError(f'Restore instance cleanup needs attention: {workspace}')
    report['temporary_instance_removed'] = True
    report['elapsed_seconds'] = round(time.monotonic()-started, 2)
    target = ROOT/'app-data/m1-restore-verification.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: isolated snapshot restored; schema, accounts, sample facts, monthly amounts and uploaded-file hashes verified.')
    print('Temporary PostgreSQL instance stopped and removed; existing development service was not changed.')


if __name__ == '__main__':
    main()
