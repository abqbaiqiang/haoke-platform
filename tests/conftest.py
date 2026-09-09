import os
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
os.environ["APP_ENV"] = "test"
os.environ["APP_SECRET_KEY"] = "m0-isolated-test-secret-" + "x" * 32
os.environ["APP_BASE_URL"] = "http://testserver"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://test:test@127.0.0.1:55432/songmao_test"
)


@pytest.fixture(scope="session")
def database_engine():
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from app.config import get_settings
    from app.db import get_engine

    url = make_url(os.environ["DATABASE_URL"])
    if not url.database or not url.database.endswith("_test"):
        pytest.fail("Refusing integration tests: TEST_DATABASE_URL database name must end in _test")
    schema = "m0test_" + uuid.uuid4().hex
    base_engine = create_engine(url, hide_parameters=True, connect_args={"connect_timeout": 5})
    try:
        with base_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    except Exception:
        pytest.fail("Test PostgreSQL unavailable; start the local database and verify test configuration", pytrace=False)
    scoped_url = url.update_query_dict({"options": f"-csearch_path={schema}"})
    os.environ["DATABASE_URL"] = scoped_url.render_as_string(hide_password=False)
    get_settings.cache_clear()
    get_engine.cache_clear()
    config = Config(str(ROOT / "apps/backend/alembic.ini"))
    try:
        command.upgrade(config, "head")
        engine = get_engine()
        yield engine
        engine.dispose()
    finally:
        # Only the random schema created above is removed; never application tables.
        with base_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        base_engine.dispose()
        os.environ["DATABASE_URL"] = url.render_as_string(hide_password=False)
        get_settings.cache_clear()
        get_engine.cache_clear()


@pytest.fixture
def db(database_engine):
    from sqlalchemy.orm import Session

    with database_engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
            yield session
        transaction.rollback()


@pytest.fixture
def accounts(db):
    from app.cli import create_user

    password = "M0-test-only-password!"
    result = {}
    for name, role, scope in [
        ("S1", "sales", "self"),
        ("S2", "sales", "self"),
        ("S3", "sales", "self"),
        ("Owner", "owner", "all"),
        ("Admin", "admin", "custom"),
    ]:
        result[name] = create_user(db, name, role, password, scope)
    result["Manager"] = create_user(
        db, "Manager", "manager", password, "team", [str(result["S1"].id), str(result["S2"].id)]
    )
    result["Finance"] = create_user(db, "Finance", "finance", password, "custom", [str(result["S1"].id)])
    result["Disabled"] = create_user(db, "Disabled", "sales", password, "self", active=False)
    db.commit()
    return result


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient
    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app, headers={"Origin": "http://testserver"}) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sign_in(client, accounts):
    def sign(name):
        client.cookies.clear()
        response = client.post("/api/auth/login", json={"username": name, "password": "M0-test-only-password!"})
        assert response.status_code == 200, response.text
        return response

    return sign
