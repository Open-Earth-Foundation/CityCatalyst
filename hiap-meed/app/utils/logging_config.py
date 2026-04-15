"""Root logging configuration for the HIAP-MEED service.

This module intentionally uses Python's stdlib `logging` (no structlog) and
configures both console and optional file logging.
"""

import logging
import os
import time
from pathlib import Path


def setup_logger() -> None:
    """Configure HIAP-MEED application logging based on environment.

    Env vars:
    - `LOG_LEVEL`: logging level (e.g. `INFO`, `DEBUG`)
    - `LOG_DIR`: directory for `app.log`
    - `LOG_FILE_ENABLED`: when falsey, disables writing `app.log` (keeps console logging)
    """
    env_level = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = getattr(logging, env_level, logging.INFO)
    log_file_enabled_raw = os.getenv("LOG_FILE_ENABLED", "true").strip().lower()
    log_file_enabled = log_file_enabled_raw in {"1", "true", "yes", "y", "on"}

    log_dir = Path(os.getenv("LOG_DIR", "logs"))
    formatter = logging.Formatter(
        fmt="%(asctime)sZ %(levelname)s %(name)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Always log timestamps in UTC to keep host + container logs comparable.
    formatter.converter = time.gmtime

    # Important: do NOT configure the root logger here. Uvicorn configures its
    # own console logging; we keep server logs separate and only handle app logs.
    app_logger = logging.getLogger("app")
    app_logger.setLevel(level)
    app_logger.propagate = False

    # Reset handlers to keep setup idempotent across imports/tests.
    app_logger.handlers = []

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    app_logger.addHandler(stream_handler)

    if log_file_enabled:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_dir / "app.log", encoding="utf-8")
        file_handler.setFormatter(formatter)
        app_logger.addHandler(file_handler)
