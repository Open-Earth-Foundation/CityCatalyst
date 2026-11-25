"""Golden-set usage recording against a mock transport; no network calls."""

from __future__ import annotations

import json

import httpx
import pytest
from app.config import get_settings

from benchmark.cnb.golden_set.models import StageUsage
from benchmark.utils.usage import UsageRecorder, measure, prompt_names

DRAFTING = "You draft chapters."
JUDGING = "You judge chapters."


def usage_body(request: httpx.Request) -> httpx.Response:
    """Mimic OpenRouter: Responses usage with your own key, Chat Completions usage without."""
    if request.url.path.endswith("/responses"):
        usage = {
            "input_tokens": 100,
            "output_tokens": 20,
            "output_tokens_details": {"reasoning_tokens": 5},
            "cost": 0,
            "is_byok": True,
            "cost_details": {"upstream_inference_cost": 0.25},
        }
    else:
        usage = {
            "prompt_tokens": 50,
            "completion_tokens": 10,
            "completion_tokens_details": {"reasoning_tokens": 2},
            "cost": 0.1,
            "is_byok": False,
            "cost_details": {"upstream_inference_cost": 0.1},
        }
    return httpx.Response(200, json={"id": "gen-1", "usage": usage})


async def test_model_calls_are_attributed_to_the_measured_stage_and_agent():
    recorder = UsageRecorder({DRAFTING: "cnb_chapter_drafting", JUDGING: "judge"})
    stage = StageUsage()
    async with httpx.AsyncClient(transport=httpx.MockTransport(usage_body)) as client:
        with recorder:
            await client.post(
                "https://openrouter.ai/api/v1/responses",
                json={"instructions": DRAFTING},
            )
            with measure(stage):
                await client.post(
                    "https://openrouter.ai/api/v1/responses",
                    json={"instructions": DRAFTING},
                )
                await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json={
                        "messages": [
                            {"role": "system", "content": JUDGING},
                            {"role": "user", "content": "x"},
                        ]
                    },
                )
                await client.post("https://example.org/api/v1/responses", json={})
                await client.get("https://openrouter.ai/api/v1/key")
        # Outside the recorder, nothing is observed.
        with measure(stage):
            await client.post(
                "https://openrouter.ai/api/v1/responses",
                json={"instructions": DRAFTING},
            )

    assert stage.requests == 2
    assert (stage.input_tokens, stage.output_tokens, stage.reasoning_tokens) == (
        150,
        30,
        7,
    )
    # Without your own key, the provider's charge is already in usage.cost.
    assert round(stage.cost_usd, 2) == 0.35
    assert stage.agents["cnb_chapter_drafting"].cost_usd == 0.25
    assert stage.agents["judge"].requests == 1
    assert stage.seconds >= 0


async def test_streamed_responses_report_usage_from_their_final_event():
    events = [
        {"type": "response.output_text.delta", "delta": "Hi"},
        {
            "type": "response.completed",
            "response": {
                "usage": {
                    "input_tokens": 40,
                    "output_tokens": 8,
                    "cost": 0,
                    "is_byok": True,
                    "cost_details": {"upstream_inference_cost": 0.5},
                }
            },
        },
    ]
    sse = "".join(f"data: {json.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n"

    class Chunks(httpx.AsyncByteStream):
        """A body delivered in pieces, as the network does (plain bytes are pre-read)."""

        async def __aiter__(self):
            for line in sse.encode().splitlines(keepends=True):
                yield line

    def stream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, stream=Chunks(), headers={"content-type": "text/event-stream"}
        )

    stage = StageUsage()
    async with httpx.AsyncClient(transport=httpx.MockTransport(stream)) as client:
        with UsageRecorder({DRAFTING: "planner"}), measure(stage):
            async with client.stream(
                "POST",
                "https://openrouter.ai/api/v1/responses",
                json={"instructions": DRAFTING},
            ) as response:
                received = b"".join([chunk async for chunk in response.aiter_bytes()])

    assert received == sse.encode()  # the caller still reads the whole stream
    assert stage.requests == 1 and stage.agents["planner"].cost_usd == 0.5
    assert (stage.input_tokens, stage.output_tokens) == (40, 8)


def test_every_configured_prompt_is_recognised():
    names = prompt_names(get_settings().llm.prompts)
    prompts = get_settings().llm.prompts
    for name in (
        "cnb_chapter_drafting",
        "cnb_chapter_support_check",
        "cnb_golden_set_editing_judge",
    ):
        assert names[prompts.get_prompt(name).strip()] == name


@pytest.mark.parametrize("response_usage", [{}, {"cost": 0, "is_byok": True}])
async def test_missing_price_is_never_reported_as_complete(response_usage):
    stage = StageUsage()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"usage": response_usage})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        with UsageRecorder({}), measure(stage):
            await client.post("https://openrouter.ai/api/v1/responses", json={})
    assert not stage.cost_complete and stage.unpriced_requests == 1
    assert not stage.agents["other"].cost_complete


async def test_failed_request_preserves_unknown_cost():
    def fail(request):
        raise httpx.ReadTimeout("mock timeout")

    stage = StageUsage()
    async with httpx.AsyncClient(transport=httpx.MockTransport(fail)) as client:
        with UsageRecorder({}), measure(stage), pytest.raises(httpx.ReadTimeout):
            await client.post("https://openrouter.ai/api/v1/responses", json={})
    assert (
        stage.requests == 1 and stage.unpriced_requests == 1 and not stage.cost_complete
    )


def test_report_shows_unpriced_requests_and_conversion_cost():
    from benchmark.cnb.golden_set.models import FixtureReport, GoldenSetReport
    from benchmark.cnb.scripts.evaluate import _render_usage

    report = GoldenSetReport(
        generated_at="2026-10-29",
        analysis_contract_version="test",
        judge_prompt_versions={},
        models={},
        fixtures=[
            FixtureReport(
                fixture_id="f",
                source_sha256="0" * 64,
                source_format="markdown",
                usage={
                    "extraction": StageUsage(cost_complete=False, unpriced_requests=1)
                },
                input_provenance={
                    "conversion": {
                        "elapsed_seconds": 2.5,
                        "cost": {"status": "unavailable", "usd": None},
                    }
                },
            )
        ],
    )
    text = "\n".join(_render_usage(report))
    assert "1 unpriced requests" in text
    assert "PDF conversion: 2.5 s; cost unavailable" in text
    assert "(partial)" in text
