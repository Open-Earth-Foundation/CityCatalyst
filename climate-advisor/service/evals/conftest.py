"""Eval settings: no remote MLflow unless an eval harness opts in, no paid
manual_llm cases unless --run-manual-llm-e2e is passed.

tests/conftest.py imports the two manual_llm hooks below, so `pytest evals`,
`pytest tests` and `pytest tests evals` all gate the same way.
"""

import os

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Keep eval runs from writing runs or traces to remote MLflow by default."""
    os.environ["MLFLOW_ENABLED"] = "false"


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register --run-manual-llm-e2e once, whichever conftests are loaded."""
    try:
        parser.addoption(
            "--run-manual-llm-e2e",
            action="store_true",
            default=False,
            help="Run manual-only tests that call live LLM and CC services.",
        )
    except ValueError:
        # Both evals/ and tests/ conftests share this hook; the first one registered it.
        pass


def pytest_collection_modifyitems(
    config: pytest.Config,
    items: list[pytest.Item],
) -> None:
    """Skip manual_llm items unless --run-manual-llm-e2e is passed."""
    if config.getoption("--run-manual-llm-e2e"):
        return

    skip_manual_llm = pytest.mark.skip(
        reason="manual_llm tests are disabled by default; pass --run-manual-llm-e2e to run them",
    )
    for item in items:
        if "manual_llm" in item.keywords:
            item.add_marker(skip_manual_llm)
