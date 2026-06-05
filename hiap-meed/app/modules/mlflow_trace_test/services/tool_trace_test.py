"""Isolated OpenAI tool-call test flow for inspecting MLflow traces."""

from __future__ import annotations

import json
import os
from typing import Any

from app.modules.mlflow_trace_test.models import (
    MlflowToolTraceTestApiRequest,
    MlflowToolTraceTestApiResponse,
    MlflowToolTraceTestToolResult,
)
from app.services.openai_client import create_openai_client

DEFAULT_TRACE_TEST_MODEL = "gpt-5.4-mini"


def is_mlflow_tool_trace_test_enabled() -> bool:
    """Return whether the test-only MLflow tool trace endpoint is enabled."""
    return (
        os.getenv("HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_ENABLED", "false")
        .strip()
        .lower()
        == "true"
    )


def get_mlflow_tool_trace_test_model() -> str:
    """Return the OpenAI model used by the test-only tool trace endpoint."""
    return (
        os.getenv("HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_MODEL", DEFAULT_TRACE_TEST_MODEL)
        .strip()
        or DEFAULT_TRACE_TEST_MODEL
    )


def _add_numbers(*, left_number: float, right_number: float) -> dict[str, object]:
    """Return a deterministic sum payload for MLflow tool trace testing."""
    return {
        "left_number": left_number,
        "right_number": right_number,
        "sum": left_number + right_number,
    }


def _reverse_text(*, text: str) -> dict[str, object]:
    """Return a deterministic reverse-text payload for MLflow tool trace testing."""
    return {
        "original_text": text,
        "reversed_text": text[::-1],
        "character_count": len(text),
    }


def _tool_schemas() -> list[dict[str, object]]:
    """Return the two local tool schemas exposed to the OpenAI test flow."""
    return [
        {
            "type": "function",
            "function": {
                "name": "add_numbers",
                "description": "Add two numbers for MLflow tool-call trace testing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "left_number": {"type": "number"},
                        "right_number": {"type": "number"},
                    },
                    "required": ["left_number", "right_number"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "reverse_text",
                "description": "Reverse one text input for MLflow tool-call trace testing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                    },
                    "required": ["text"],
                    "additionalProperties": False,
                },
            },
        },
    ]


def _execute_tool_call(tool_name: str, arguments: dict[str, object]) -> dict[str, object]:
    """Execute one supported local test tool and return its structured output."""
    if tool_name == "add_numbers":
        return _add_numbers(
            left_number=float(arguments["left_number"]),
            right_number=float(arguments["right_number"]),
        )
    if tool_name == "reverse_text":
        return _reverse_text(text=str(arguments["text"]))
    raise ValueError(f"Unsupported tool call `{tool_name}`")


def run_mlflow_tool_trace_test(
    request: MlflowToolTraceTestApiRequest,
) -> MlflowToolTraceTestApiResponse:
    """Run one isolated OpenAI tool-calling loop for MLflow trace inspection."""
    client = create_openai_client()
    model = get_mlflow_tool_trace_test_model()

    # Step 1: Ask the model to call both local tools before answering.
    messages: list[dict[str, object]] = [
        {
            "role": "system",
            "content": (
                "You are a test assistant for MLflow tracing. "
                "Call both available tools exactly once before you answer. "
                "After tool execution, reply with one short sentence that includes the sum "
                "and the reversed text."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Add {request.left_number} and {request.right_number}. "
                f"Also reverse this text: {request.text_to_reverse!r}."
            ),
        },
    ]
    first_completion = client.chat.completions.create(
        model=model,
        messages=messages,
        tools=_tool_schemas(),
        tool_choice="required",
    )
    first_message = first_completion.choices[0].message
    tool_calls = list(first_message.tool_calls or [])
    if not tool_calls:
        raise ValueError("OpenAI tool trace test returned no tool calls")

    # Step 2: Execute the requested local tools and append their results.
    messages.append(
        {
            "role": "assistant",
            "content": first_message.content or "",
            "tool_calls": [
                {
                    "id": tool_call.id,
                    "type": tool_call.type,
                    "function": {
                        "name": tool_call.function.name,
                        "arguments": tool_call.function.arguments,
                    },
                }
                for tool_call in tool_calls
            ],
        }
    )
    tool_results: list[MlflowToolTraceTestToolResult] = []
    for tool_call in tool_calls:
        arguments = json.loads(tool_call.function.arguments or "{}")
        result = _execute_tool_call(tool_call.function.name, arguments)
        tool_results.append(
            MlflowToolTraceTestToolResult(
                tool_name=tool_call.function.name,
                arguments=arguments,
                result=result,
            )
        )
        messages.append(
            {
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result),
            }
        )

    # Step 3: Let the model produce the final user-facing summary.
    second_completion = client.chat.completions.create(
        model=model,
        messages=messages,
        tools=_tool_schemas(),
    )
    final_text = second_completion.choices[0].message.content or ""
    return MlflowToolTraceTestApiResponse(
        model=model,
        final_text=final_text,
        tool_results=tool_results,
    )
