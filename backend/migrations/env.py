from logging.config import fileConfig
from typing import Any

from alembic import context
from alembic.autogenerate.api import AutogenContext

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.database import Base, engine
from app.models import UTCDateTime

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)


def render_item(type_: str, obj: Any, autogen_context: AutogenContext) -> str | bool:
    """Write UTCDateTime columns as plain timestamps, so migrations don't import app code."""
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False


# Migrations run online only, against the same engine and DATABASE_URL as the app.
with engine.connect() as connection:
    # Batch mode lets future ALTER TABLE migrations also run on SQLite, which the tests use.
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        render_as_batch=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()
