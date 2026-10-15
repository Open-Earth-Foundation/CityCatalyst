"""Golden-set usage recording against a mock transport; no network calls."""

from __future__ import annotations

import json

import httpx
from app.models.cnb.golden_set import StageUsage
from app.services.cnb.golden_set_usage import UsageRecorder, measure, prompt_names

from app.config import get_settings

DRAFTING = "You draft chapters."
JUDGING = "You judge chapters."


def usage_body(request: httpx.Request) -> httpx.Response:
    """Mimic OpenRouter: the Responses and Chat Completions usage shapes, BYOK cost."""
    if request.url.path.endswith("/responses"):
        usage = {
            "input_tokens": 100,
            "output_tokens": 20,
            "output_tokens_details": {"reasoning_tokens": 5},
            "cost": 0,
            "cost_details": {"upstream_inference_cost": 0.25},
        }
    else:
        usage = {
            "prompt_tokens": 50,
            "completion_tokens": 10,
            "completion_tokens_details": {"reasoning_tokens": 2},
            "cost": 0.01,
            "cost_details": {"upstream_inference_cost": 0.1},
        }
    return httpx.Response(200, json={"id": "gen-1", "usage": usage})


async def test_model_calls_are_attributed_to_the_measured_stage_and_agent():
    recorder = UsageRecorder({DRAFTING: "cnb_chapter_drafting", JUDGING: "judge"})
    stage = StageUsage()
    async with httpx.AsyncClient(transport=httpx.MockTransport(usage_body)) as client:
        with recorder:
            await client.post("https://openrouter.ai/api/v1/responses", json={"instructions": DRAFTING})
            with measure(stage):
                await client.post("https://openrouter.ai/api/v1/responses", json={"instructions": DRAFTING})
                await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json={"messages": [{"role": "system", "content": JUDGING}, {"role": "user", "content": "x"}]},
                )
                await client.post("https://example.org/api/v1/responses", json={})
                await client.get("https://openrouter.ai/api/v1/key")
        # Outside the recorder, nothing is observed.
        with measure(stage):
            await client.post("https://openrouter.ai/api/v1/responses", json={"instructions": DRAFTING})

    assert stage.requests == 2
    assert (stage.input_tokens, stage.output_tokens, stage.reasoning_tokens) == (150, 30, 7)
    assert round(stage.cost_usd, 2) == 0.36
    assert stage.agents["cnb_chapter_drafting"].cost_usd == 0.25
    assert stage.agents["judge"].requests == 1
    assert stage.seconds >= 0


async def test_streamed_responses_report_usage_from_their_final_event():
    events = [
        {"type": "response.output_text.delta", "delta": "Hi"},
        {"type": "response.completed", "response": {"usage": {"input_tokens": 40, "output_tokens": 8, "cost": 0, "cost_details": {"upstream_inference_cost": 0.5}}}},
    ]
    sse = "".join(f"data: {json.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n"

    class Chunks(httpx.AsyncByteStream):
        """A body delivered in pieces, as the network does (plain bytes are pre-read)."""

        async def __aiter__(self):
            for line in sse.encode().splitlines(keepends=True):
                yield line

    def stream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=Chunks(), headers={"content-type": "text/event-stream"})

    stage = StageUsage()
    async with httpx.AsyncClient(transport=httpx.MockTransport(stream)) as client:
        with UsageRecorder({DRAFTING: "planner"}), measure(stage):
            async with client.stream("POST", "https://openrouter.ai/api/v1/responses", json={"instructions": DRAFTING}) as response:
                received = b"".join([chunk async for chunk in response.aiter_bytes()])

    assert received == sse.encode()  # the caller still reads the whole stream
    assert stage.requests == 1 and stage.agents["planner"].cost_usd == 0.5
    assert (stage.input_tokens, stage.output_tokens) == (40, 8)


def test_every_configured_prompt_is_recognised():
    names = prompt_names(get_settings().llm.prompts)
    prompts = get_settings().llm.prompts
    for name in ("cnb_chapter_drafting", "cnb_chapter_support_check", "cnb_golden_set_editing_judge"):
        assert names[prompts.get_prompt(name).strip()] == name
