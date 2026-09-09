"""Browser acceptance in a disposable test schema and separate local ports."""
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from e2e_fixtures import prepare

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
for port in [3100, 8100]:
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', port))
load_dotenv('.env')
base = make_url(os.environ.get('TEST_DATABASE_URL', os.environ['DATABASE_URL']))
if not base.database.endswith('_test'):
    base = base.set(database='songmao_test')
if base.host not in {'127.0.0.1', 'localhost'}:
    raise SystemExit('Isolated browser helper only permits a local test database')
schema = 'm1browser_' + uuid.uuid4().hex
engine = create_engine(base, hide_parameters=True)
with engine.begin() as c:
    c.execute(text(f'CREATE SCHEMA "{schema}"'))
env = dict(os.environ)
env.update(DATABASE_URL=base.update_query_dict({'options': f'-csearch_path={schema}'}).render_as_string(hide_password=False),
           APP_ENV='test', APP_SECRET_KEY=secrets.token_urlsafe(48), APP_BASE_URL='http://localhost:3100',
           INTERNAL_API_URL='http://127.0.0.1:8100', E2E_BASE_URL='http://localhost:3100',
           PYTHONPATH=str(ROOT/'apps/backend'), NEXT_DIST_DIR='.next-e2e', NEXT_TELEMETRY_DISABLED='1',
           E2E_BROWSER_CHANNEL=env.get('E2E_BROWSER_CHANNEL', 'msedge'),
           UPLOAD_ROOT=str(ROOT/'.tools/browser-uploads'/schema))
children = []
handles = []
fixture_dir = ROOT/'.tools'/schema
env['E2E_FINANCE_FIXTURES'] = prepare(fixture_dir)
(ROOT/'.tools'/f'{schema}.schema').write_text(schema, encoding='utf-8')
try:
    subprocess.run([sys.executable, '-m', 'alembic', '-c', 'apps/backend/alembic.ini', 'upgrade', 'head'], env=env, check=True)
    subprocess.run([sys.executable, '-m', 'app.cli', 'seed-demo'], env=env, check=True)
    for name, command, cwd in [
        ('backend', [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8100', '--no-access-log'], ROOT),
        ('frontend', ['node', 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100'], ROOT/'apps/frontend'),
    ]:
        handle = (ROOT/'.tools'/f'm1-browser-{name}.log').open('w', encoding='utf-8')
        handles.append(handle)
        children.append(subprocess.Popen(command, cwd=cwd, env=env, stdout=handle, stderr=handle,
                                         creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0))
    for url in ['http://127.0.0.1:8100/health', 'http://localhost:3100']:
        deadline = time.monotonic()+90
        while True:
            try:
                with urllib.request.urlopen(url, timeout=3) as response:
                    if response.status == 200:
                        break
            except Exception:
                if time.monotonic() > deadline or any(p.poll() is not None for p in children):
                    raise RuntimeError('Isolated browser services did not become ready; inspect private logs') from None
                time.sleep(1)
    result = subprocess.run(['node', 'node_modules/@playwright/test/cli.js', 'test', *sys.argv[1:]],
                             cwd=ROOT/'apps/frontend', env=env)
    raise SystemExit(result.returncode)
finally:
    for child in reversed(children):
        if child.poll() is None:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], capture_output=True)
            else:
                child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.terminate()
                print('Test service cleanup requires process-tree permission; inspect test ports before another run.')
    for handle in handles:
        handle.close()
    with engine.begin() as c:
        c.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()
    # Only this invocation's generated upload directory, under .tools, can be removed.
    generated = Path(env['UPLOAD_ROOT']).resolve()
    if generated.is_relative_to((ROOT/'.tools/browser-uploads').resolve()) and generated.name == schema:
        shutil.rmtree(generated, ignore_errors=True)
    shutil.rmtree(fixture_dir)
