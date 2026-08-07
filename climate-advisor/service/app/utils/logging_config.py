"""Shared process-level logging configuration."""

from __future__ import annotations

import logging


DEFAULT_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


def configure_logging(
    level: int | str = logging.INFO,
    *,
    format_string: str = DEFAULT_LOG_FORMAT,
) -> None:
    """Configure the root logger for an application or CLI entrypoint."""
    logging.basicConfig(level=level, format=format_string)
