"""Unit tests for the removable MLflow tool trace test module."""

from __future__ import annotations

from types import SimpleNamespace

from app.modules.mlflow_trace_test.models import MlflowToolTraceTestApiRequest
from app.modules.mlflow_trace_test.services import tool_trace_test


def test_run_mlflow_tool_trace_test_executes_both_tools(monkeypatch) -> None:
    """The isolated test flow should execute both local tools and return a final summary."""

    first_message = SimpleNamespace(
        content="",
        tool_calls=[
            SimpleNamespace(
                id="call-1",
                type="function",
                function=SimpleNamespace(
                    name="add_numbers",
                    arguments='{"left_number": 2, "right_number": 3}',
                ),
            ),
            SimpleNamespace(
                id="call-2",
                type="function",
                function=SimpleNamespace(
                    name="reverse_text",
                    arguments='{"text": "climate"}',
                ),
            ),
        ],
    )
    second_message = SimpleNamespace(
        content="The sum is 5 and the reversed text is etamilc.",
        tool_calls=None,
    )

    class RecordingCompletions:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def create(self, **kwargs):
            self.calls.append(kwargs)
            message = first_message if len(self.calls) == 1 else second_message
            return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    completions = RecordingCompletions()
    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    monkeypatch.setattr(tool_trace_test, "create_openai_client", lambda: fake_client)
    monkeypatch.setenv("HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_MODEL", "gpt-test")

    response = tool_trace_test.run_mlflow_tool_trace_test(
        MlflowToolTraceTestApiRequest(
            left_number=2,
            right_number=3,
            text_to_reverse="climate",
        )
    )

    assert response.model == "gpt-test"
    assert response.final_text == "The sum is 5 and the reversed text is etamilc."
    assert [row.tool_name for row in response.tool_results] == [
        "add_numbers",
        "reverse_text",
    ]
    assert response.tool_results[0].result["sum"] == 5
    assert response.tool_results[1].result["reversed_text"] == "etamilc"
    assert len(completions.calls) == 2


def test_run_mlflow_tool_trace_test_raises_when_no_tool_calls(monkeypatch) -> None:
    """The test flow should fail loudly if the model returns no tool calls."""

    message = SimpleNamespace(content="No tools", tool_calls=None)
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: SimpleNamespace(
                    choices=[SimpleNamespace(message=message)]
                )
            )
        )
    )
    monkeypatch.setattr(tool_trace_test, "create_openai_client", lambda: fake_client)

    try:
        tool_trace_test.run_mlflow_tool_trace_test(
            MlflowToolTraceTestApiRequest(
                left_number=1,
                right_number=2,
                text_to_reverse="abc",
            )
        )
    except ValueError as error:
        assert str(error) == "OpenAI tool trace test returned no tool calls"
    else:
        raise AssertionError("Expected ValueError when no tool calls are returned")
