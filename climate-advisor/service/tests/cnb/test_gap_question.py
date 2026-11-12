import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from app.config.settings import Settings, _load_llm_config
from app.models.cnb.gap_question import (
    GapQuestionOutput,
    GapQuestionRequest,
    GapSubQuestion,
)
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.persistence.concept_notes.edits import applied_gap_answers
from app.routes.concept_note_runs import propose_gap_question
from app.services.cnb.chat_suggestions import generate_suggestion
from fastapi import HTTPException
from pydantic import ValidationError
from tests.test_concept_note_lifecycle import _workspace_repository


@pytest.mark.parametrize(
    "options", [["Loan"], ["Loan", " loan "], ["", "Grant"], ["x"] * 6]
)
def test_rejects_single_or_invalid_choices(options):
    with pytest.raises(ValidationError):
        GapSubQuestion(question="Instrument?", options=options)


@pytest.mark.parametrize("count", [0, 5])
def test_requires_one_to_four_questions(count):
    with pytest.raises(ValidationError):
        GapQuestionOutput(
            why_asking="Support needed",
            questions=[{"question": f"Part {i}?", "options": []} for i in range(count)],
        )


async def test_generates_validated_question_with_dedicated_prompt(monkeypatch):
    settings = Settings(llm=_load_llm_config(), openrouter_api_key="test-key")
    output = {
        "why_asking": "Support needed",
        "questions": [
            {"question": "Instrument?", "options": ["Loan", "Grant", "Guarantee"]},
            {"question": "Amount?", "options": []},
        ],
    }
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(output)))]
    )
    monkeypatch.setattr(
        "app.services.cnb.chat_suggestions.AsyncOpenAI", Mock(return_value=client)
    )
    result = await generate_suggestion(
        settings, {"question": "Original gap"}, "cnb_gap_question", GapQuestionOutput
    )
    assert result.model_dump() == output
    messages = client.chat.completions.create.call_args.kwargs["messages"]
    assert "one short question" in messages[0]["content"]
    assert json.loads(messages[1]["content"]) == {"question": "Original gap"}


@pytest.fixture
def gap_route(monkeypatch):
    chapter_id, gap_id = uuid4(), uuid4()
    run = SimpleNamespace(run_id=uuid4())
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        Mock(return_value=SimpleNamespace(get_authorized_run=authorize)),
    )
    chapter = SimpleNamespace(
        chapter_id=chapter_id,
        title="Financing",
        body_markdown="Current draft " * 2000
        + "[Information needed: Original question]",
        gaps=[
            SimpleNamespace(
                gap_id=gap_id,
                state="open",
                question="Original question",
                why_asking="Needed",
            )
        ],
    )
    draft_service = SimpleNamespace(
        load_state=AsyncMock(return_value=SimpleNamespace(chapters=[chapter]))
    )
    generate = AsyncMock(
        return_value=GapQuestionOutput(
            why_asking="Support needed",
            questions=[{"question": "Instrument?", "options": ["Loan", "Grant"]}],
        )
    )
    monkeypatch.setattr("app.routes.concept_note_runs.generate_suggestion", generate)
    previous = AsyncMock(return_value=["Earlier answer " * 300])
    monkeypatch.setattr("app.routes.concept_note_runs.applied_gap_answers", previous)
    cnb_session = AsyncMock()
    cnb_session.__aenter__.return_value = cnb_session
    monkeypatch.setattr(
        "app.routes.concept_note_runs.get_cnb_reference_session_factory",
        Mock(return_value=Mock(return_value=cnb_session)),
    )
    return SimpleNamespace(
        authorize=authorize,
        chapter=chapter,
        generate=generate,
        previous=previous,
        args={
            "run_id": run.run_id,
            "payload": GapQuestionRequest(
                chapter_id=chapter_id, gap_id=gap_id, question="Client text"
            ),
            "request": SimpleNamespace(is_disconnected=AsyncMock(return_value=False)),
            "draft_service": draft_service,
            "session": AsyncMock(),
            "user_id": "owner",
            "authorization": "Bearer test",
        },
    )


async def test_authorizes_before_reading_gap(gap_route):
    gap_route.authorize.side_effect = HTTPException(status_code=403)
    with pytest.raises(HTTPException) as error:
        await propose_gap_question(**gap_route.args)
    assert error.value.status_code == 403
    gap_route.args["draft_service"].load_state.assert_not_called()
    gap_route.generate.assert_not_called()


@pytest.mark.parametrize(
    "change,status", [("chapter", 404), ("gap", 409), ("closed", 409), ("legacy", 404)]
)
async def test_rejects_foreign_or_stale_gap(gap_route, change, status):
    payload = gap_route.args["payload"]
    if change == "chapter":
        payload.chapter_id = uuid4()
    elif change == "gap":
        payload.gap_id = uuid4()
    elif change == "closed":
        gap_route.chapter.gaps[0].state = "resolved"
    else:
        payload.gap_id = None
    with pytest.raises(HTTPException) as error:
        await propose_gap_question(**gap_route.args)
    assert error.value.status_code == status
    gap_route.generate.assert_not_called()


async def test_uses_server_question_and_bounded_chapter_without_writing(gap_route):
    result = await propose_gap_question(**gap_route.args)
    assert result.questions[0].options == ["Loan", "Grant"]
    context = gap_route.generate.call_args.args[1]
    assert context["question"] == "Original question"
    # Long chapters are cut around the gap, not from the start.
    assert len(context["chapter_excerpt"]) == 12000
    assert context["chapter_excerpt"].endswith("Original question]")
    # Earlier accepted answers in this chapter steer the model away from re-asking.
    assert gap_route.previous.call_args.kwargs == {
        "run_id": gap_route.args["run_id"],
        "chapter_id": gap_route.chapter.chapter_id,
        "question": "Original question",
    }
    # Whole entries: truncating would drop later answers and undecided parts.
    assert context["previous_answers"] == ["Earlier answer " * 300]
    gap_route.args["session"].commit.assert_not_called()


async def test_provider_failure_is_explicit_and_retryable(gap_route):
    gap_route.generate.return_value = None
    with pytest.raises(HTTPException) as error:
        await propose_gap_question(**gap_route.args)
    assert error.value.status_code == 503


async def test_previous_answers_keep_only_accepted_text_from_this_chapter():
    run_id, chapter_id = uuid4(), uuid4()
    accepted, rejected = str(uuid4()), str(uuid4())
    question = "What is the requested instrument?"
    # The app's real request templates, so their prose never counts as an answer.
    templates = json.loads(
        (
            Path(__file__).parents[4] / "app/src/i18n/locales/en/concept-notes.json"
        ).read_text(encoding="utf-8")
    )

    def request(key, answer):
        return (
            templates[key]
            .replace("{{chapter}}", "Financing plan")
            .replace("{{question}}", question)
            .replace("{{answer}}", answer)
        )

    def proposal(minute, status, instruction, chapter=chapter_id, **values):
        return ConceptNoteEditProposal(
            run_id=run_id,
            actor_user_id="owner",
            idempotency_key=uuid4(),
            request_fingerprint="a" * 64,
            instruction=instruction,
            scope={"kind": "auto", "focused_chapter_id": str(chapter)},
            status=status,
            created_at=datetime(2026, 10, 26, 12, minute, tzinfo=UTC),
            **values,
        )

    async with _workspace_repository() as (_, factory):
        async with factory() as session, session.begin():
            session.add_all(
                [
                    proposal(
                        0,
                        "applied",
                        request("gap-answer-request", "1. Amount?\nEUR 1m"),
                    ),
                    proposal(
                        1,
                        "applied",
                        request(
                            "gap-answer-complete-request",
                            "1. Instrument?\nLoan\n\nPaid back over ten years.",
                        ),
                    ),
                    proposal(2, "applied", f"{question}\nBond", chapter=uuid4()),
                    proposal(3, "rejected", f"{question}\nGuarantee"),
                    proposal(4, "applied", "Another gap\nGrant"),
                    proposal(
                        5,
                        "partially_applied",
                        f"{question}\n1. Instrument?\nGrant\n\n2. Amount?\nEUR 2m",
                        changes=[
                            {"change_id": accepted, "user_input_quote": "Grant"},
                            {"change_id": rejected, "user_input_quote": "EUR 2m"},
                        ],
                        applied_result={"accepted_change_ids": [accepted]},
                    ),
                ]
            )
        async with factory() as session:
            answers = await applied_gap_answers(
                session,
                run_id=run_id,
                chapter_id=chapter_id,
                question=question,
                limit=6,
            )
    # The rejected amount is asked again; the same question in another chapter
    # does not count as answered here.
    assert answers == [
        "Grant",
        "1. Instrument?\nLoan\n\nPaid back over ten years.",
        "1. Amount?\nEUR 1m",
    ]
