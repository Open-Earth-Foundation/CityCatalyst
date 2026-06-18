"""Pydantic models for the removable MLflow tool-trace test endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MlflowToolTraceTestApiRequest(BaseModel):
    """Request payload for the MLflow tool-call trace test endpoint."""

    left_number: float = Field(description="First number to add with the test tool.")
    right_number: float = Field(description="Second number to add with the test tool.")
    text_to_reverse: str = Field(
        min_length=1,
        description="Text that the test reverse tool should reverse.",
    )


class MlflowToolTraceTestToolResult(BaseModel):
    """One executed local test tool call plus its structured output."""

    tool_name: str = Field(description="Executed local test tool name.")
    arguments: dict[str, object] = Field(
        description="Arguments that the LLM passed into the tool."
    )
    result: dict[str, object] = Field(description="Structured tool output.")


class MlflowToolTraceTestApiResponse(BaseModel):
    """Response payload for the MLflow tool-call trace test endpoint."""

    model: str = Field(description="OpenAI model used for the test call.")
    final_text: str = Field(description="Final assistant text after tool execution.")
    tool_results: list[MlflowToolTraceTestToolResult] = Field(
        description="Executed local tool calls in order."
    )
