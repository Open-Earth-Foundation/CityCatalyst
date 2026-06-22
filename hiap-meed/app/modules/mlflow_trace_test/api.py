"""FastAPI routes for the removable MLflow tool-call trace test flow."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.modules.mlflow_trace_test.models import (
    MlflowToolTraceTestApiRequest,
    MlflowToolTraceTestApiResponse,
)
from app.modules.mlflow_trace_test.services.tool_trace_test import (
    is_mlflow_tool_trace_test_enabled,
    run_mlflow_tool_trace_test,
)
from app.utils.mlflow_logging import (
    log_json_artifact,
    log_metrics,
    log_params,
    start_run,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mlflow-trace-test"])


@router.post(
    "/v1/mlflow/trace-test/tool-calls",
    response_model=MlflowToolTraceTestApiResponse,
    summary="Run a test-only LLM tool-calling flow for MLflow tracing",
)
def run_tool_call_trace_test(
    request: MlflowToolTraceTestApiRequest,
) -> MlflowToolTraceTestApiResponse:
    """Run an isolated tool-calling request solely for MLflow trace inspection."""
    if not is_mlflow_tool_trace_test_enabled():
        raise HTTPException(status_code=404, detail="Not found")

    request_id = str(uuid4())
    with start_run(
        run_name="mlflow_tool_trace_test_request",
        tags={
            "service": "hiap-meed",
            "request_kind": "mlflow_tool_trace_test",
            "endpoint": "/v1/mlflow/trace-test/tool-calls",
            "test_only": "true",
            "internal_request_id": request_id,
        },
        params={
            "left_number": request.left_number,
            "right_number": request.right_number,
            "text_length": len(request.text_to_reverse),
        },
    ):
        logger.info("MLflow tool trace test started internal_request_id=%s", request_id)
        response = run_mlflow_tool_trace_test(request)
        log_metrics(
            {
                "tool_calls": len(response.tool_results),
                "final_text_characters": len(response.final_text),
            }
        )
        log_params({"tool_names": ",".join(row.tool_name for row in response.tool_results)})
        log_json_artifact(
            "mlflow_trace_test_response.json",
            response.model_dump(mode="json"),
        )
        logger.info("MLflow tool trace test completed internal_request_id=%s", request_id)
        return response
