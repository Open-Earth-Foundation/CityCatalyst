"""Inputs that determine reusable registered-document source readings."""

from app.services.document_workspace.requirements import fingerprint
from app.services.document_workspace.semantic_passages import (
    DIMENSIONS,
    PASSAGE_CHARS,
    RANKED_UNIT_LIMIT,
)

REQUIREMENTS_PER_READ = 8
REVIEW_CONTEXT_CHARS = 2400
REVIEW_BATCH_CHARS = 28000
POINT_READER_VERSION = 6
FIELD_SEARCH_TOKENS = 8000
SEARCH_PLAN_INPUT_TOKENS = 8000
SEARCH_PLAN_TOTAL_TOKENS = 16000
PUBLIC_FIELDS = (
    "key",
    "label",
    "description",
    "section_context",
    "usual_document",
    "answer_type",
    "kind",
    "choices",
    "unit",
    "minimum",
    "maximum",
)
NARRATIVE_INPUT_CHARS = 60_000
NARRATIVE_SECTION_ITEMS = 10


def point_reader_model(settings):
    models = settings.llm.models
    return models.cnb_point_reader or models.cnb_source_reader


def point_partition_tokens(settings):
    return min(
        settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens, 38_000
    )


def point_reader_contract(settings):
    """Hash effective behavior equally for source reuse and stored findings."""
    budget = settings.llm.generation.prompt_budget
    contract = {
        "version": POINT_READER_VERSION,
        "model": point_reader_model(settings).model_dump(mode="json"),
        "prompts": {
            name: settings.llm.prompts.get_prompt(name)
            for name in (
                "document_setup_reading",
                "document_setup_search",
                "document_evidence_review",
                "document_narrative_synthesis",
            )
        },
        "partition_tokens": point_partition_tokens(settings),
        "tokenizer": budget.tokenizer_encoding,
        "group_size": REQUIREMENTS_PER_READ,
        "review_context_chars": REVIEW_CONTEXT_CHARS,
        "review_batch_chars": REVIEW_BATCH_CHARS,
        "narrative_input_chars": NARRATIVE_INPUT_CHARS,
        "narrative_section_items": NARRATIVE_SECTION_ITEMS,
    }
    if budget.cnb_sources.independent_field_search_enabled:
        model = settings.llm.models.cnb_point_embedding_model
        contract["field_search"] = {
            "prompt": settings.llm.prompts.get_prompt("document_field_search"),
            "scan_tokens": FIELD_SEARCH_TOKENS,
            "plan_limits": [SEARCH_PLAN_INPUT_TOKENS, SEARCH_PLAN_TOTAL_TOKENS],
            "embedding_model": model,
            "semantic_ranking": [DIMENSIONS, PASSAGE_CHARS, RANKED_UNIT_LIMIT]
            if model
            else None,
        }
    return fingerprint(contract)
