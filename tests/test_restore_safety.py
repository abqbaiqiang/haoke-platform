"""Restore CLI must reject unsafe targets before it can spawn or copy anything."""
import importlib.util
import sys
from pathlib import Path

import pytest


@pytest.fixture
def restore_cli(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[1]/'scripts/verify_local_snapshot.py'
    spec = importlib.util.spec_from_file_location('restore_safety_module', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://test@127.0.0.1:55432/test')
    def unexpected(*args, **kwargs):
        pytest.fail('Unsafe restore request reached filesystem copying or process creation')
    monkeypatch.setattr(module.shutil, 'copytree', unexpected)
    monkeypatch.setattr(module.subprocess, 'run', unexpected)
    snapshot = tmp_path/'app-data/backups/snapshot'
    snapshot.mkdir(parents=True)
    (snapshot/'PG_VERSION').write_text('18')
    binaries = tmp_path/'bin'
    binaries.mkdir()
    (binaries/('pg_ctl.exe' if module.os.name == 'nt' else 'pg_ctl')).touch()
    def run(snapshot_path=snapshot, port=55434):
        monkeypatch.setattr(sys, 'argv', ['restore', '--snapshot', str(snapshot_path), '--pg-bin', str(binaries), '--port', str(port)])
        module.main()
    return run


def test_restore_refuses_snapshot_outside_backup_root(restore_cli, tmp_path):
    foreign = tmp_path/'foreign'
    foreign.mkdir()
    (foreign/'PG_VERSION').write_text('18')
    with pytest.raises(SystemExit, match='within this project'):
        restore_cli(foreign)


def test_restore_refuses_current_database_port(restore_cli):
    with pytest.raises(SystemExit, match='separate local port'):
        restore_cli(port=55432)


def test_restore_refuses_production_environment(restore_cli, monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    with pytest.raises(SystemExit, match='development'):
        restore_cli()
