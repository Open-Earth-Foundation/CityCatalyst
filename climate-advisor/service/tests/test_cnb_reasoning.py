"""Visible reasoning streams without answer, encrypted item, or request leakage."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.utils.cnb_progress import (
    bind_cnb_progress,
    emit_cnb_reasoning,
    run_with_cnb_reasoning,
)


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
