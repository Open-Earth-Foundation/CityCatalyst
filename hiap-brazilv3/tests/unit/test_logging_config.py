"""Tests for logging setup."""

import logging

import pytest

from app.utils.logging_config import setup_logger


@pytest.fixture
def restore_app_logger():
    """Reapply the default logging setup after a test changes the `app` logger."""
    yield
    setup_logger()


@pytest.mark.unit
@pytest.mark.parametrize("env_level", ["ERROR", "CRITICAL"])
def test_log_level_is_capped_at_warning(
    monkeypatch: pytest.MonkeyPatch, restore_app_logger: None, env_level: str
) -> None:
    """LOG_LEVEL above WARNING is capped so the scaffold warning stays visible."""
    monkeypatch.setenv("LOG_LEVEL", env_level)
    monkeypatch.setenv("LOG_FILE_ENABLED", "false")

    setup_logger()

    assert logging.getLogger("app").level == logging.WARNING


@pytest.mark.unit
def test_log_level_below_warning_is_kept(
    monkeypatch: pytest.MonkeyPatch, restore_app_logger: None
) -> None:
    """LOG_LEVEL=DEBUG is honored."""
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("LOG_FILE_ENABLED", "false")

    setup_logger()

    assert logging.getLogger("app").level == logging.DEBUG
