import logging


def setup_logger(level=logging.INFO):
    logging.basicConfig(
        level=level,
        format="%(filename)s:%(lineno)d - %(levelname)s - %(message)s",
        force=True,
    )
