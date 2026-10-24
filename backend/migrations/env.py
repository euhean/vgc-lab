from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.database import Base, engine

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)

# Migrations run online only, against the same engine and DATABASE_URL as the app.
with engine.connect() as connection:
    # Batch mode lets future ALTER TABLE migrations also run on SQLite, which the tests use.
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
