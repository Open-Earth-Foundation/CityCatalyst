import logging
import os


def setup_logger():
    env_level = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = getattr(logging, env_level, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(filename)s:%(lineno)d - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )
