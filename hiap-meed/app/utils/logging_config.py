"""Root logging configuration for the HIAP-MEED service."""

import logging
import os
from pathlib import Path


def setup_logger() -> None:
    """Configure root logging based on environment."""
    env_level = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = getattr(logging, env_level, logging.INFO)
    log_dir = Path(os.getenv("LOG_DIR", "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_dir / "app.log")
    stream_handler = logging.StreamHandler()

    logging.basicConfig(
        level=level,
        format="%(asctime)s %(filename)s:%(lineno)d - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[stream_handler, file_handler],
        force=True,
    )


__all__ = ["setup_logger"]

