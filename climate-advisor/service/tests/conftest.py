from __future__ import annotations

import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-manual-llm-e2e",
        action="store_true",
        default=False,
        help="Run manual-only Stationary Energy E2E tests that call live LLM and CC services.",
    )


def pytest_collection_modifyitems(
    config: pytest.Config,
    items: list[pytest.Item],
) -> None:
    if config.getoption("--run-manual-llm-e2e"):
        return

    skip_manual_llm = pytest.mark.skip(
        reason="manual_llm tests are disabled by default; pass --run-manual-llm-e2e to run them",
    )
    for item in items:
        if "manual_llm" in item.keywords:
            item.add_marker(skip_manual_llm)
