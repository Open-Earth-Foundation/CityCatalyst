"""Shared FastAPI dependencies. Version-agnostic - lives in db/, used by any API version.

Injecting the session as a dependency (instead of calling SessionLocal() inside the handler)
is what lets tests swap the database via:

    app.dependency_overrides[get_session] = lambda: FakeSession()

No string-path monkeypatching, and nothing that breaks when a route file moves between
folders. This is the pattern v2 endpoints should use.
"""
from db.database import SessionLocal


def get_session():
    """Yield a DB session and guarantee it is closed. Override this in tests."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
