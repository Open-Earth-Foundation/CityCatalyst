"""Custom SQLAlchemy types for cross-database compatibility."""

from sqlalchemy import JSON
from sqlalchemy.types import TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB


class JSONBCompat(TypeDecorator):
    """Use native JSONB on Postgres while remaining SQLite-friendly for tests."""

    impl = JSONB  # type: ignore[assignment]
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(JSON())
        return dialect.type_descriptor(JSONB())  # type: ignore[call-arg]

    def process_bind_param(self, value, dialect):
        return value

    def process_result_value(self, value, dialect):
        return value

