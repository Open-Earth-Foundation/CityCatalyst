"""Generate two optional next questions without changing the run or chat."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import tiktoken
from app.config.settings import Settings
from app.models.cnb.chat_suggestions import (
    ChatSuggestionsOutput,
    ChatSuggestionsRequest,
    ChatSuggestionsResponse,
)
from app.models.cnb.concept_note_draft import ConceptNoteDraftResponse
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.message import Message, MessageRole
from app.services.openrouter_client import build_openrouter_client_options
from openai import AsyncOpenAI, OpenAIError

logger = logging.getLogger(__name__)


def build_suggestion_context(
    request: ChatSuggestionsRequest,
    run: ConceptNoteRun,
    draft: ConceptNoteDraftResponse | None,
    bundle: dict[str, Any],
    messages: list[Message],
) -> dict[str, Any]:
    """Bound document/history text and expose only compact workspace metadata."""
    encoder = tiktoken.get_encoding("o200k_base")

    def prefix(text: str, limit: int) -> str:
        """Keep a valid UTF-8 prefix within the token allowance."""
        tokens = encoder.encode(text, disallowed_special=())[:limit]
        return encoder.decode_bytes(tokens).decode("utf-8", errors="ignore")

    # Assemble only the created chapter bodies in document order, never uploads.
    chapters = (
        sorted(draft.chapters, key=lambda chapter: chapter.position) if draft else []
    )
    document = "\n\n".join(
        f"# {chapter.title}\n\n{chapter.body_markdown}"
        for chapter in chapters
        if chapter.body_markdown
    )
    cc_context = bundle.get("cc_context") or {}
    return {
        **request.model_dump(),
        "workspace": {
            "workflow_step": run.workflow_step,
            "funding_selected": run.selected_funding_opportunity_id is not None,
            "source_count": len(bundle.get("selected_sources") or []),
            "source_readiness": (run.context_summary or {})
            .get("context_bundle", {})
            .get("status", "unavailable"),
            "available_city_modules": [
                name for name in ("ghgi", "ccra", "hiap") if cc_context.get(name)
            ],
            "draft_status": draft.status if draft else "unavailable",
            "open_gap_count": sum(chapter.open_gap_count for chapter in chapters),
        },
        "document_prefix": prefix(document, 20_000),
        "recent_messages": [
            {"role": message.role.value, "content": prefix(message.text, 2_000)}
            for message in messages[-6:]
            if message.role in (MessageRole.USER, MessageRole.ASSISTANT)
        ],
    }


async def generate_chat_suggestions(
    settings: Settings, payload: dict[str, Any]
) -> ChatSuggestionsResponse:
    """Make one bounded OpenRouter call; failures request a localized UI fallback."""
    model = settings.llm.models.cnb_chat_suggestions
    if model is None:
        return ChatSuggestionsResponse()

    # Suggestions are optional and must never block normal chat on provider errors.
    try:
        options = build_openrouter_client_options(
            settings, missing_api_key_message="Suggestion model is unavailable"
        )
        async with (
            asyncio.timeout(20),
            AsyncOpenAI(**{**options.kwargs, "max_retries": 0}) as client,
        ):
            response = await client.chat.completions.create(
                model=model.name,
                messages=[
                    {
                        "role": "system",
                        "content": settings.llm.prompts.get_prompt(
                            "cnb_chat_suggestions"
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(payload, ensure_ascii=False),
                    },
                ],
                response_format={"type": "json_object"},
                extra_body={"reasoning": {"effort": model.reasoning_effort}},
                max_completion_tokens=4096,
            )
        output = ChatSuggestionsOutput.model_validate_json(
            response.choices[0].message.content or ""
        )
        return ChatSuggestionsResponse(suggestions=output.suggestions)
    except (OpenAIError, ValueError, TimeoutError, OSError, IndexError) as exc:
        # Exception text can contain provider request bodies; log only its type.
        logger.warning("CNB suggestions unavailable (%s)", type(exc).__name__)
        return ChatSuggestionsResponse()
