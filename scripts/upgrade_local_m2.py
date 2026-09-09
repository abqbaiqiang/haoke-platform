"""Back up the existing local development cluster, then migrate with evidence checks."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]


def fingerprint(engine, columns):
    result = {}
    with engine.connect() as c:
        for table, names in columns.items():
            # Identifiers come from PostgreSQL inspection; quote them via the dialect.
            quote = engine.dialect.identifier_preparer.quote
            selected = ','.join(quote(n) for n in names)
            query = f'SELECT row_to_json(t)::text FROM (SELECT {selected} FROM {quote(table)}) t'
            rows = sorted(c.scalars(text(query)))
            result[table] = {'count':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    args = parser.parse_args()
    load_dotenv(ROOT/'.env')
    url = make_url(os.environ['DATABASE_URL'])
    if os.environ.get('APP_ENV') != 'development' or url.host not in {'127.0.0.1','localhost'}:
        raise SystemExit('This helper only upgrades the local development database.')
    engine = create_engine(url, hide_parameters=True, connect_args={'connect_timeout':5})
    with engine.connect() as c:
        data = Path(c.scalar(text('SHOW data_directory'))).resolve()
        version = c.scalar(text('SELECT version_num FROM alembic_version'))
    if not (data/'PG_VERSION').is_file():
        raise SystemExit('Database data_directory is not locally accessible.')
    executable = (args.pg_bin/'pg_ctl.exe').resolve()
    if not executable.is_file():
        raise SystemExit('PostgreSQL control executable missing.')
    inspector = inspect(engine)
    # Session, throttle and activity rows can change through normal platform use;
    # all existing business/system configuration rows are compared using their old columns.
    exclude = {'alembic_version','sys_session','sys_login_throttle','activity_log'}
    columns = {t:[x['name'] for x in inspector.get_columns(t)] for t in inspector.get_table_names() if t not in exclude}
    before = fingerprint(engine, columns)
    uploads = {}
    upload_root = (ROOT/'app-data/uploads').resolve()
    with engine.connect() as c:
        for row in c.execute(text('SELECT storage_path,file_hash FROM import_batch')).mappings():
            file = (upload_root/row['storage_path']).resolve()
            if not file.is_relative_to(upload_root) or not file.is_file():
                raise RuntimeError('A referenced upload is missing or outside the upload root')
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
            if digest != row['file_hash']:
                raise RuntimeError('An original upload hash does not match')
            uploads[row['storage_path']] = digest
    engine.dispose()
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = ROOT/'app-data/backups'/f'pre-m2-postgres-{stamp}'
    backup.parent.mkdir(parents=True,exist_ok=True)
    report = {'from_revision':version,'backup':str(backup),'before':before,'upload_count':len(uploads)}
    subprocess.run([str(executable),'-D',str(data),'-m','fast','-w','stop'],check=True)
    try:
        shutil.copytree(data, backup)
        manifest = {str(p.relative_to(backup)):hashlib.sha256(p.read_bytes()).hexdigest() for p in backup.rglob('*') if p.is_file()}
        for relative, digest in manifest.items():
            if hashlib.sha256((data/relative).read_bytes()).hexdigest() != digest:
                raise RuntimeError('Offline database snapshot differs from its source')
        (backup.parent/f'{backup.name}.sha256.json').write_text(json.dumps(manifest),encoding='utf-8')
    finally:
        with (ROOT/'app-data/m2-postgres-start.log').open('wb') as log:
            subprocess.run([str(executable),'-D',str(data),'-l',str(data.parent/'postgres.log'),
                            '-o',f'-h 127.0.0.1 -p {url.port or 5432}','-w','start'],stdout=log,stderr=log,check=True)
    env = dict(os.environ,PYTHONPATH=str(ROOT/'apps/backend'))
    subprocess.run([sys.executable,'-m','alembic','-c','apps/backend/alembic.ini','upgrade','head'],cwd=ROOT,env=env,check=True)
    after = fingerprint(engine, columns)
    # M2 intentionally initializes ownership_status for existing owners when upgrading M1.
    if before != after:
        raise RuntimeError('Existing business columns changed; inspect the backup before continuing')
    for relative, digest in uploads.items():
        if hashlib.sha256((upload_root/relative).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Upload file changed during migration')
    with engine.connect() as c:
        report['to_revision'] = c.scalar(text('SELECT version_num FROM alembic_version'))
    report.update(existing_columns_unchanged=True, upload_hashes_unchanged=True, snapshot_files=len(manifest))
    (ROOT/'app-data/m2-local-upgrade.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(f"PASS: offline snapshot ({len(manifest)} files), existing business columns and {len(uploads)} uploads verified; {version} -> {report['to_revision']}")
    engine.dispose()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Driver exceptions can include connection strings. Never print them.
        raise SystemExit(f'Local M2 upgrade stopped ({type(exc).__name__}); inspect the private snapshot/startup evidence before retrying.') from None
