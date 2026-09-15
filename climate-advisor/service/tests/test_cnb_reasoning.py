"""Visible reasoning streams without answer, encrypted item, or request leakage."""

import asyncio
import inspect
import json
from functools import wraps
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from openai import AsyncOpenAI

from app.utils.cnb_observability import protect_cnb_client
from app.utils.cnb_progress import (
    bind_cnb_progress,
    emit_cnb_reasoning,
    run_with_cnb_reasoning,
)


@pytest.mark.asyncio
async def test_completed_summaries_recover_missing_text_without_duplicates():
    events = []

    async def capture(chunk):
        events.append(json.loads(chunk.decode().split("data: ")[1]))

    part = SimpleNamespace(type="summary_text", text="Checking the budget.")
    item = SimpleNamespace(
        type="reasoning", id="reason-1", summary=[part], encrypted_content="opaque"
    )
    with bind_cnb_progress(capture):
        for event in [
            SimpleNamespace(
                type="response.reasoning_summary_text.delta",
                item_id=item.id,
                summary_index=0,
                delta="Checking ",
            ),
            SimpleNamespace(
                type="response.reasoning_summary_text.done",
                item_id=item.id,
                summary_index=0,
                text=part.text,
            ),
            SimpleNamespace(
                type="response.reasoning_summary_part.done",
                item_id=item.id,
                summary_index=0,
                part=part,
            ),
            SimpleNamespace(type="response.output_item.done", item=item),
            SimpleNamespace(
                type="response.completed", response=SimpleNamespace(output=[item])
            ),
        ]:
            await emit_cnb_reasoning(event, stream_id="one", stage="chat")
        # A second part and a parallel worker are independent of the first part.
        item.summary.append(
            SimpleNamespace(type="summary_text", text="Confirming dates.")
        )
        await emit_cnb_reasoning(
            SimpleNamespace(type="response.output_item.done", item=item),
            stream_id="one",
            stage="chat",
        )
        await emit_cnb_reasoning(
            SimpleNamespace(type="response.output_item.done", item=item),
            stream_id="two",
            stage="reading",
        )

    assert [e["delta"] for e in events] == [
        "Checking ",
        "the budget.",
        "Confirming dates.",
        "Checking the budget.",
        "Confirming dates.",
    ]
    assert events[0]["id"] == events[1]["id"]
    assert len({e["id"] for e in events}) == 4
    assert "opaque" not in json.dumps(events)


@pytest.mark.asyncio
async def test_final_snapshot_corrects_partial_text_and_request_state_is_isolated():
    events = []

    async def capture(chunk):
        events.append(json.loads(chunk.decode().split("data: ")[1]))

    async def request():
        with bind_cnb_progress(capture):
            await emit_cnb_reasoning(
                SimpleNamespace(
                    type="response.reasoning_summary_text.delta", delta="Partial"
                ),
                stream_id="same",
                stage="chat",
            )
            await asyncio.sleep(0)
            await emit_cnb_reasoning(
                SimpleNamespace(
                    type="response.reasoning_summary_text.done", text="Complete summary"
                ),
                stream_id="same",
                stage="chat",
            )

    await asyncio.gather(request(), request())
    assert sum(e["delta"] == "Partial" for e in events) == 2
    assert sum(e.get("replace", False) for e in events) == 2


@pytest.mark.asyncio
async def test_only_readable_reasoning_deltas_reach_the_request_sink():
    events = []

    async def capture(chunk):
        events.append(json.loads(chunk.decode().split("data: ")[1]))

    with bind_cnb_progress(capture):
        for kind in (
            "response.reasoning_summary_text.delta",
            "response.reasoning_text.delta",
            "response.output_text.delta",
            "response.output_item.added",
        ):
            await emit_cnb_reasoning(
                SimpleNamespace(type=kind, delta="Visible summary"),
                stream_id="one",
                stage="chat",
            )
    await emit_cnb_reasoning(
        SimpleNamespace(type="response.reasoning_text.delta", delta="outside"),
        stream_id="other",
        stage="chat",
    )
    assert len(events) == 2
    assert all(
        event
        == {
            "id": "one",
            "stage": "chat",
            "chapter_title": None,
            "delta": "Visible summary",
        }
        for event in events
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True])
async def test_chapter_reasoning_arrives_before_final_result_and_cancellation_stops_runner(
    cancel,
):
    arrived = asyncio.Event()
    release = asyncio.Event()
    events = []

    async def capture(chunk):
        events.append(json.loads(chunk.decode().split("data: ")[1]))
        arrived.set()

    class Result:
        is_complete = False
        final_output = None
        cancel = Mock()

        async def stream_events(self):
            yield SimpleNamespace(
                type="raw_response_event",
                data=SimpleNamespace(
                    type="response.reasoning_text.delta",
                    delta="Checking the exact passage.",
                ),
            )
            await release.wait()
            self.final_output = {"intent": "question"}
            self.is_complete = True

    result = Result()
    runner = SimpleNamespace(run_streamed=Mock(return_value=result))
    with bind_cnb_progress(capture):
        task = asyncio.create_task(
            run_with_cnb_reasoning(
                runner,
                "agent",
                "payload",
                run_config=None,
                stage="planning",
                chapter_title="Budget",
            )
        )
        await asyncio.wait_for(arrived.wait(), 1)
        assert result.final_output is None
        assert events[0]["chapter_title"] == "Budget"
        if cancel:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            result.cancel.assert_called_once()
        else:
            release.set()
            assert await task is result
            assert result.final_output == {"intent": "question"}
            result.cancel.assert_not_called()


@pytest.mark.asyncio
async def test_cnb_client_removes_payload_logging_from_both_api_surfaces():
    client = AsyncOpenAI(api_key="test-only")
    originals = []
    try:
        for resource in (client.chat.completions, client.responses):
            for name in ("create", "parse"):
                original = getattr(resource, name)
                unwrapped = inspect.unwrap(original)
                expected = (
                    unwrapped.__func__ if inspect.ismethod(unwrapped) else unwrapped
                )
                originals.append((resource, name, expected))

                @wraps(original)
                async def payload_logging_wrapper(*args, **kwargs):
                    raise AssertionError("Raw-payload logger must not run")

                setattr(resource, name, payload_logging_wrapper)

        assert protect_cnb_client(client) is client
        for resource, name, original in originals:
            restored = getattr(resource, name)
            assert restored.__func__ is original
            assert restored.__self__ is resource
    finally:
        await client.close()
