from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings
from app.models import Base
from app import data_models  # noqa: F401
from app import crm_models  # noqa: F401
from app import bi_models  # noqa: F401

target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url.get_secret_value(), target_metadata=target_metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(get_settings().database_url.get_secret_value(), hide_parameters=True)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
