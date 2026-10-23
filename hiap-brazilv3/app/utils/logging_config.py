"""Root logging configuration for the HIAP Brazil v3 service."""

import logging
import os
import time
from pathlib import Path


def setup_logger() -> None:
    """Configure application logging based on environment.

    The level is capped at WARNING: while the methodology is a scaffold, the
    scaffold warnings must stay visible, so `LOG_LEVEL=ERROR` or `CRITICAL`
    behaves like `WARNING`.

    Env vars:
    - `LOG_LEVEL`: logging level (e.g. `INFO`, `DEBUG`); values above WARNING are capped
    - `LOG_DIR`: directory for `app.log`
    - `LOG_FILE_ENABLED`: when falsey, disables writing `app.log` (keeps console logging)
    """
    env_level = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = min(getattr(logging, env_level, logging.INFO), logging.WARNING)
    log_file_enabled_raw = os.getenv("LOG_FILE_ENABLED", "true").strip().lower()
    log_file_enabled = log_file_enabled_raw in {"1", "true", "yes", "y", "on"}

    log_dir = Path(os.getenv("LOG_DIR", "logs"))
    formatter = logging.Formatter(
        fmt="%(asctime)sZ %(levelname)s %(name)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Always log timestamps in UTC to keep host + container logs comparable.
    formatter.converter = time.gmtime

    # Only configure the `app` logger; uvicorn owns its own console logging.
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
