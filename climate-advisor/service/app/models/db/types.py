"""Custom SQLAlchemy types for cross-database compatibility."""

from typing import Any

from sqlalchemy import JSON
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator, TypeEngine
from sqlalchemy.dialects.postgresql import JSONB


class JSONBCompat(TypeDecorator):
    """Use native JSONB on Postgres while remaining SQLite-friendly for tests."""

    impl = JSONB  # type: ignore[assignment]
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine[Any]:
        """Select JSON for SQLite and native JSONB for PostgreSQL."""
        if dialect.name == "sqlite":
            return dialect.type_descriptor(JSON())
        return dialect.type_descriptor(JSONB())  # type: ignore[call-arg]

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        """Pass Python JSON-compatible values through to SQLAlchemy."""
        return value

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        """Return decoded JSON values without additional coercion."""
        return value

