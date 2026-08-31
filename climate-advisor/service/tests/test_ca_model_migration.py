"""Validate current CA model routing and real SDK payloads without network calls."""

import json
from uuid import uuid4

import httpx
import pytest
from agents import RunConfig, Runner, function_tool
from app.config import get_settings
from app.models.cnb.source_prompt import DocumentSummary, QuestionReading
from app.services.agent_service import AgentService
from app.services.cnb.source_analysis import (
    _run_agent,
    source_analysis_contract_version,
)
from openai import AsyncOpenAI


def test_all_active_ca_model_defaults_use_the_requested_family():
    models = get_settings().llm.models
    expected = {
        "orchestrator": ("openai/gpt-5.6-luna", "none"),
        "agentic_flow": ("openai/gpt-5.6-sol", "none"),
        "funding_research": ("openai/gpt-5.6-sol", "medium"),
        "funder_identity": ("openai/gpt-5.6-luna", "low"),
        "cnb_source_reader": ("openai/gpt-5.6-luna", "low"),
        "cnb_source_synthesizer": ("openai/gpt-5.6-sol", "medium"),
        "cnb_chapter_drafter": ("openai/gpt-5.6-terra", "medium"),
    }
    for role, (model, effort) in expected.items():
        configured = getattr(models, role)
        assert configured.name == model
        assert configured.reasoning_effort == effort
    assert models.orchestrator.temperature is None
    assert models.agentic_flow.temperature is None


def completion(model, *, content=None, tool_calls=None, finish_reason="stop"):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "id": "chatcmpl-local-test",
        "object": "chat.completion",
        "created": 0,
        "model": model,
        "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
    }


@pytest.mark.parametrize("mode", ["general", "cnb", "stationary_energy", "custom"])
@pytest.mark.asyncio
async def test_chat_modes_round_trip_function_tools_with_explicit_none(
    monkeypatch, mode
):
    requests = []
    tool_invocations = []

    @function_tool
    def lookup_evidence(question: str) -> str:
        """Return a fixed source excerpt for the local tool-loop test."""
        tool_invocations.append(question)
        return "Drainage upgrades are proposed."

    def respond(request: httpx.Request):
        assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
        body = json.loads(request.content)
        requests.append(body)
        if len(requests) == 1:
            result = completion(
                body["model"],
                tool_calls=[
                    {
                        "id": "call-evidence",
                        "type": "function",
                        "function": {
                            "name": "lookup_evidence",
                            "arguments": '{"question":"What is proposed?"}',
                        },
                    }
                ],
                finish_reason="tool_calls",
            )
        else:
            result = completion(
                body["model"], content="Drainage upgrades are proposed."
            )
        return httpx.Response(200, json=result)

    client = AsyncOpenAI(
        api_key="local-test-only",
        base_url="https://openrouter.ai/api/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )
    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "local-test-only"
    monkeypatch.setattr("app.services.agent_service.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.agent_service.AsyncOpenAI", lambda **kwargs: client
    )
    service = AgentService()
    try:
        model = service.preferred_model_for_context(
            concept_note_run_id=str(uuid4()) if mode == "cnb" else None,
            stationary_energy_draft_run_id=str(uuid4())
            if mode == "stationary_energy"
            else None,
        )
        if mode == "custom":
            model = "openai/gpt-4.1"
        agent = await service.create_agent(model=model)
        agent.tools = [lookup_evidence]
        result = await Runner.run(
            agent, "What is proposed?", run_config=RunConfig(tracing_disabled=True)
        )
    finally:
        await service.close()
    assert result.final_output == "Drainage upgrades are proposed."
    assert tool_invocations == ["What is proposed?"]
    assert len(requests) == 2
    for body in requests:
        assert body["model"] == model
        if mode == "custom":
            assert "reasoning_effort" not in body
        else:
            assert body["reasoning_effort"] == "none"
        assert "temperature" not in body
        assert body["tools"][0]["function"]["name"] == "lookup_evidence"
    assert any(
        message.get("tool_call_id") == "call-evidence"
        for message in requests[1]["messages"]
    )


@pytest.mark.parametrize(
    "role,output_type,output",
    [
        (
            "cnb_source_reader",
            QuestionReading,
            {"sections": [{"excerpts": [], "caveats": []}]},
        ),
        (
            "cnb_source_synthesizer",
            DocumentSummary,
            {
                "summary": "No budget is stated.",
                "topics": ["budget"],
                "key_excerpts": [],
            },
        ),
    ],
)
@pytest.mark.asyncio
async def test_source_roles_preserve_reasoning_and_structured_outputs(
    role, output_type, output
):
    settings = get_settings().model_copy(deep=True)
    configured = getattr(settings.llm.models, role)
    requests = []

    def respond(request: httpx.Request):
        body = json.loads(request.content)
        requests.append(body)
        return httpx.Response(
            200, json=completion(body["model"], content=json.dumps(output))
        )

    class LocalRunner:
        @staticmethod
        async def run(agent, input_text):
            return await Runner.run(
                agent, input_text, run_config=RunConfig(tracing_disabled=True)
            )

    async with AsyncOpenAI(
        api_key="local-test-only",
        base_url="https://openrouter.ai/api/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    ) as client:
        result = await _run_agent(
            name="Source compatibility test",
            prompt=settings.llm.prompts.get_prompt(
                "cnb_source_question_reading"
                if role == "cnb_source_reader"
                else "cnb_source_summary_synthesis"
            ),
            model_name=configured.name,
            output_type=output_type,
            input_text="No budget is stated.",
            settings=settings,
            client=client,
            runner=LocalRunner,
        )
    assert result == output_type.model_validate(output)
    assert len(requests) == 1
    body = requests[0]
    assert body["model"] == configured.name
    assert body["reasoning_effort"] == configured.reasoning_effort
    assert "temperature" not in body
    assert not body.get("tools")
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True


@pytest.mark.parametrize("role", ["cnb_source_reader", "cnb_source_synthesizer"])
def test_source_model_changes_invalidate_analysis_reuse(role):
    settings = get_settings().model_copy(deep=True)
    version = source_analysis_contract_version(settings)
    getattr(settings.llm.models, role).name = "previous-model"
    assert source_analysis_contract_version(settings) != version
