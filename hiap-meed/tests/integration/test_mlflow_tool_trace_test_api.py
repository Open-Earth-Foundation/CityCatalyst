"""Integration-style API tests for the removable MLflow tool trace endpoint."""

from __future__ import annotations

from app.modules.mlflow_trace_test.models import MlflowToolTraceTestApiResponse


def test_tool_trace_test_endpoint_returns_404_when_disabled(client, monkeypatch) -> None:
    """The removable trace endpoint should stay hidden until explicitly enabled."""
    monkeypatch.setenv("HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_ENABLED", "false")

    response = client.post(
        "/v1/mlflow/trace-test/tool-calls",
        json={"left_number": 2, "right_number": 3, "text_to_reverse": "climate"},
    )

    assert response.status_code == 404


def test_tool_trace_test_endpoint_returns_test_payload_when_enabled(
    client, monkeypatch
) -> None:
    """The trace endpoint should return the isolated tool-call payload when enabled."""
    monkeypatch.setenv("HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_ENABLED", "true")
    monkeypatch.setattr(
        "app.modules.mlflow_trace_test.api.run_mlflow_tool_trace_test",
        lambda request: MlflowToolTraceTestApiResponse(
            model="gpt-test",
            final_text="done",
            tool_results=[
                {
                    "tool_name": "add_numbers",
                    "arguments": {"left_number": 2, "right_number": 3},
                    "result": {"sum": 5},
                }
            ],
        ),
    )

    response = client.post(
        "/v1/mlflow/trace-test/tool-calls",
        json={"left_number": 2, "right_number": 3, "text_to_reverse": "climate"},
    )

    assert response.status_code == 200
    assert response.json()["model"] == "gpt-test"
    assert response.json()["tool_results"][0]["tool_name"] == "add_numbers"
