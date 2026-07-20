"""Tests for the CNB funder research agent loop and coverage checks."""

from types import SimpleNamespace

from app.services.cnb_research_agent import find_missing_data, run_agent_loop
from tests.cnb_research_helpers import build_request, build_result


def test_missing_data_allows_multinational_funder_country_to_remain_null() -> None:
    """Coverage does not equate an institution's headquarters with its country."""
    missing = find_missing_data(build_result(), request=build_request())

    assert not any("funder_country" in item for item in missing)


def test_agent_reopens_an_incomplete_structured_checkpoint_for_next_turn() -> None:
    """An early partial object is followed by missing-data and turn context."""
    parsed_result = build_result()

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=parsed_result,
            )

    client = SimpleNamespace(responses=FakeResponses())
    trace = []
    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(),
        trace=trace,
        openai_client=client,
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert outcome.turns_used == 2
    assert outcome.termination_reason == "turn_limit"
    assert len(client.responses.calls) == 2
    assert "tools" in client.responses.calls[0]
    assert "tools" not in client.responses.calls[1]
    second_input = client.responses.calls[1]["input"]
    assert isinstance(second_input, list)
    progress_message = second_input[-1]["content"]
    assert "<current_filled_object>" in progress_message
    assert "<missing_data>" in progress_message
    assert "turns_remaining_after_this: 0" in progress_message
    assert "<final_gap_audit>" in progress_message
