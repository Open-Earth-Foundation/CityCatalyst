"""
Alembic migration environment for vector database.

This configures Alembic to work with the vector database connection.
"""

import os
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import MetaData

from alembic import context

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Try multiple possible locations for .env file
    possible_paths = [
        Path(__file__).parent.parent.parent / '.env',  # From migrations/env.py -> vector_db/.env
        Path(__file__).parent.parent.parent.parent / '.env',  # From migrations/env.py -> climate-advisor/.env
        Path.cwd() / '.env',  # Current working directory
        Path.cwd().parent / '.env',  # Parent of current working directory
    ]

    env_loaded = False
    for env_path in possible_paths:
        if env_path.exists():
            load_dotenv(env_path)
            print(f"Loaded environment from: {env_path}")
            env_loaded = True
            break

    if not env_loaded:
        print("Warning: No .env file found in expected locations")
except ImportError:
    print("Warning: python-dotenv not available, environment variables must be set manually")

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Create a simple metadata object for this migration
# We don't need to import models since this migration is simple
target_metadata = MetaData()

# Database URL from environment variable (same as main service)
database_url = os.getenv("CA_DATABASE_URL")
if not database_url:
    raise ValueError("CA_DATABASE_URL environment variable is required")

# Set the database URL in the config
config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table="alembic_version_vector",  # Use separate version table
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            version_table="alembic_version_vector"  # Use separate version table
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
