"""Model payload cleanup preserves backend identity and rejects invalid selections."""

import json
import re
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.models.cnb.research import (
    FieldEvidence,
    FundedProjectResearchResult,
    FunderTemplateResearchResult,
    ResearchConflictResult,
    TemplateChapterDraft,
)
from app.models.cnb.research_prompt import ResearchPromptResult
from app.models.cnb.similar_projects import SimilarProjectSelections
from app.models.cnb.source_prompt import (
    DocumentMappingReading,
    DocumentSummary,
    QuestionReading,
)
from app.services.cnb.funder_identity_match import FunderIdentityLlmDecisionSet
from app.services.cnb.research_agent import execute_tool_calls, run_agent_loop
from app.services.cnb.research_prompt import (
    model_research_state,
    restore_research_state,
)
from app.utils.concept_note_context import clean_cnb_history, omit_context_identifiers
from openai.lib._pydantic import to_strict_json_schema
from tests.cnb.helpers import build_request, build_result


def assert_clean(value):
    if isinstance(value, dict):
        for key, child in value.items():
            assert not re.search(
                r"(?:^|_)(?:ids?|uuids?|refs?|hash|fingerprint|sha256)$", key
            ), key
            assert key not in {
                "local_snapshot_path",
                "markdown_s3_key",
                "analysis_contract_version",
            }
            assert_clean(child)
    elif isinstance(value, list):
        for child in value:
            assert_clean(child)


def populated_state():
    state = build_result()
    state.funded_projects = [
        FundedProjectResearchResult(
            funded_project_ref="project-private",
            funder_ref=state.funder.funder_ref,
            name="Drainage project",
            summary="Drainage upgrades were funded.",
        )
    ]
    state.funder_templates = [
        FunderTemplateResearchResult(
            template_ref="template-private",
            funding_opportunity_ref="opportunity-001",
            template_name="Application",
            chapter_schema=[
                TemplateChapterDraft(chapter_ref="chapter-private-1", title="Summary"),
                TemplateChapterDraft(chapter_ref="chapter-private-2", title="Budget"),
            ],
        )
    ]
    state.evidence.append(
        FieldEvidence(
            evidence_ref="evidence-project",
            funded_project_ref="project-private",
            target_path="funded_projects[project-private].summary",
            source_ref="source-002",
            quote_or_summary="Drainage upgrades were funded.",
        )
    )
    state.conflicts = [
        ResearchConflictResult(
            target_path="funded_projects[project-private].summary",
            candidate_values=["Funded", "Planned"],
            evidence_refs=["evidence-project"],
            explanation="Published reports disagree.",
        )
    ]
    return state


def test_research_projection_round_trip_keeps_identity_only_in_backend():
    state = populated_state()
    original = state.model_dump(mode="json")
    sources = [
        SimpleNamespace(source_ref="source-002", url="https://funder.example/program")
    ]
    public = model_research_state(state, sources)
    payload = public.model_dump(mode="json")
    assert_clean(payload)
    assert "project-private" not in json.dumps(payload)
    assert payload["evidence"][1]["project_position"] == 0
    assert payload["evidence"][1]["field"] == "funded_projects[0].summary"
    assert payload["conflicts"][0]["evidence_positions"] == [1]
    restored = restore_research_state(public, state, sources)
    assert restored.funded_projects[0].funded_project_ref == "project-private"
    assert (
        restored.funder_templates[0].chapter_schema[1].chapter_ref
        == "chapter-private-2"
    )
    assert restored.evidence[1].source_ref == "source-002"
    assert restored.evidence[1].funded_project_ref == "project-private"
    assert restored.conflicts[0].evidence_refs == [restored.evidence[1].evidence_ref]
    assert state.model_dump(mode="json") == original


@pytest.mark.parametrize("bad", ["source", "project", "evidence", "order"])
def test_research_rejects_invented_or_reassigned_correspondence(bad):
    state = populated_state()
    sources = [
        SimpleNamespace(source_ref="source-002", url="https://funder.example/program")
    ]
    public = model_research_state(state, sources)
    if bad == "source":
        public.evidence[0].source_url = "https://not-captured.example/"
    elif bad == "project":
        public.evidence[1].project_position = 99
    elif bad == "evidence":
        public.conflicts[0].evidence_positions = [99]
    else:
        public.funded_projects[0].name = "Different project"
    with pytest.raises(ValueError):
        restore_research_state(public, state, sources)


@pytest.mark.parametrize(
    "model",
    [
        ResearchPromptResult,
        DocumentMappingReading,
        QuestionReading,
        DocumentSummary,
        SimilarProjectSelections,
        FunderIdentityLlmDecisionSet,
    ],
)
def test_strict_model_schemas_do_not_request_backend_identifiers(model):
    schema = to_strict_json_schema(model)

    def check(node):
        if isinstance(node, dict):
            assert_clean({name: None for name in node.get("properties", {})})
            for child in node.values():
                check(child)
        elif isinstance(node, list):
            for child in node:
                check(child)

    check(schema)


def test_chat_history_cleans_nested_tool_json_but_not_user_prose():
    old_result = {
        "upload_id": str(uuid4()),
        "source_ref": "source-private",
        "text": "Drainage upgrades.",
    }
    tool_message = {
        "role": "system",
        "content": "INTERNAL_TOOL_OUTPUT_JSON\n"
        + json.dumps(
            {
                "tools_used": [
                    {
                        "id": "call-private",
                        "name": "concept_note_sources_query",
                        "arguments": json.dumps(
                            {"upload_id": str(uuid4()), "question": "What upgrades?"}
                        ),
                        "result": json.dumps(old_result),
                    }
                ]
            }
        ),
    }
    user_message = {"role": "user", "content": tool_message["content"]}
    cleaned = clean_cnb_history([tool_message, user_message])
    assert cleaned[0]["role"] == "user"
    assert tool_message["role"] == "system"
    assert clean_cnb_history(cleaned) == cleaned
    payload = json.loads(cleaned[0]["content"].split("\n", 1)[1])
    assert_clean(payload)
    assert payload["tools_used"][0]["result"]["text"] == old_result["text"]
    assert cleaned[1] == user_message
    assert (
        clean_cnb_history(
            [{"role": "system", "content": "INTERNAL_TOOL_OUTPUT_JSON\n[]"}]
        )
        == []
    )


def test_research_first_and_later_turns_have_no_metadata_ids():
    state = build_result()
    calls = []

    class Responses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                id="response-protocol-id",
                output=[],
                output_parsed=model_research_state(state, []),
            )

    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[
            {
                "source_ref": "source-private",
                "url": "https://funder.example/program",
                "local_snapshot_path": "sources/private.md",
                "markdown": "Programme description.",
            }
        ],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=[],
        openai_client=SimpleNamespace(responses=Responses()),
        model_name="test-model",
        reasoning_effort="medium",
        prompt="Research facts.",
    )
    first = json.loads(calls[0]["input"])
    assert_clean(first)
    assert "opportunity-001" not in calls[0]["input"]
    assert "source-private" not in calls[0]["input"]
    assert "opportunity-001" not in calls[1]["input"][-1]["content"]
    assert calls[1]["previous_response_id"] == "response-protocol-id"
    assert outcome.result.funder.funder_ref == state.funder.funder_ref


def test_firecrawl_output_keeps_protocol_link_but_not_snapshot_metadata():
    result = execute_tool_calls(
        tool_calls=[
            SimpleNamespace(
                name="firecrawl_scrape",
                arguments='{"url":"https://example.org"}',
                call_id="call-protocol-id",
            )
        ],
        turn_number=1,
        trace=[],
        firecrawl=SimpleNamespace(
            scrape=lambda **kwargs: {
                "source_ref": "source-private",
                "local_snapshot_path": "sources/private.md",
                "url": "https://example.org",
                "markdown": "Public evidence.",
            }
        ),
    )
    assert result[0]["call_id"] == "call-protocol-id"
    assert_clean(json.loads(result[0]["output"]))


def test_projection_removes_templates_and_hash_locators_without_losing_facts():
    cleaned = omit_context_identifiers(
        {
            "template_id": str(uuid4()),
            "chapter_ref": "chapter-private",
            "sha256": "a" * 64,
            "excerpts": [
                {"text": "Evidence", "anchor": "priorities/drainage/block-a81bd152fa20"}
            ],
        }
    )
    assert_clean(cleaned)
    assert cleaned == {
        "excerpts": [{"text": "Evidence", "heading": "priorities/drainage"}]
    }


def test_research_retries_invalid_selection_with_an_identifier_free_correction():
    state = build_result()
    calls = []

    class Responses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            result = model_research_state(state, [])
            if len(calls) == 1:
                result.evidence[0].project_position = 99
            return SimpleNamespace(
                id="response-protocol", output=[], output_parsed=result
            )

    trace = []
    result = run_agent_loop(
        request=build_request(max_turns=1),
        seed_sources=[],
        firecrawl=SimpleNamespace(captured_sources=[]),
        trace=trace,
        openai_client=SimpleNamespace(responses=Responses()),
        model_name="test-model",
        reasoning_effort="medium",
        prompt="Research facts.",
    )
    assert len(calls) == 2
    assert result.turns_used == 1
    assert trace[0].action == "structured_output_retry"
    assert "unavailable project" in calls[1]["input"]
    assert "opportunity-001" not in calls[1]["input"]
