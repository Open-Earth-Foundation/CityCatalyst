"""Skip the real-LLM suite unless RUN_REAL_LLM=1 is set."""

from __future__ import annotations

import os

import pytest


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Skip every real_llm test by default; they spend money and need local services."""
    if os.getenv("RUN_REAL_LLM") == "1":
        return
    skip = pytest.mark.skip(reason="real_llm tests need RUN_REAL_LLM=1")
    for item in items:
        if "real_llm" in item.keywords:
            item.add_marker(skip)
