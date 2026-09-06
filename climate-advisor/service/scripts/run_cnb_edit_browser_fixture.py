"""Seed synthetic data for CC-732 browser tests without bypassing authorization.

Inputs:
- action: seed appends a fixture; serve runs the model-only test server.
- --ca-database-url / --cnb-database-url: explicit loopback PostgreSQL URLs
  for databases named cc732_*; default to CA_DATABASE_URL / CNB_DATABASE_URL.
- --port: non-privileged loopback HTTP port for serve (default 8082).
- CC_BASE_URL and a synthetic local CC_API_KEY: normal thread-token issuance.
Existing Alembic migrations must be applied before seeding or serving.
Outputs: seed creates a fresh owned run, thread and three confirmed chapters,
with JSON identifiers on stdout; serve starts the real API with deterministic
model outputs on loopback. It never deletes an earlier fixture or calls a model.
Usage from climate-advisor:
    uv run --directory service python -m scripts.run_cnb_edit_browser_fixture seed
    uv run --directory service python -m scripts.run_cnb_edit_browser_fixture serve
The fixed normal author/city must first be created with the existing web
upsert-ca-smoke-fixture.ts script and the documented CC-732 fixture overrides.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, AsyncIterator
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from app.models.cnb.context_bundle import ConceptNoteContextBundle as Bundle
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
)
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.models.db.thread import Thread
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

AUTHOR_ID = "73200000-0000-4000-8000-000000000001"
CITY_ID = "73200000-0000-4000-8000-000000000004"
CHAPTERS = (
    (
        "Project summary",
        "The project will create a park that is resilient to floods. "
        "The investment amount is EUR 10 million. Delivery is planned for 2030.\n\n"
        "Existing safeguards remain unchanged.",
    ),
    (
        "Investment and delivery",
        "The investment amount is EUR 10 million. Delivery is planned for 2030.\n\n"
        "The programme protects existing green space.",
    ),
    ("Safeguards", "Existing safeguards remain unchanged. Public access is protected."),
)


def isolated_database_url(value: str | None) -> str:
    """Reject non-local/non-fixture databases before any connection is opened."""
    if not value:
        raise ValueError("The isolated CA and CNB database URLs are required")
    url = make_url(value)
    if (
        url.get_backend_name() != "postgresql"
        or url.host != "127.0.0.1"
        or not (url.database or "").startswith("cc732_")
        or not url.port
    ):
        raise ValueError("CC-732 fixtures require an explicit loopback test database")
    return url.set(drivername="postgresql+asyncpg").render_as_string(
        hide_password=False
    )


def fixture_cc_connection() -> tuple[str, str]:
    """Pin fixture service authentication to the explicit local CityCatalyst app."""
    base_url = os.getenv("CC_BASE_URL", "")
    target = urlsplit(base_url)
    key = os.getenv("CC_API_KEY", "")
    if (
        target.scheme != "http"
        or target.hostname != "127.0.0.1"
        or not target.port
        or not key
    ):
        raise ValueError(
            "Fixture token issuance requires an explicit loopback CC_BASE_URL and synthetic CC_API_KEY"
        )
    return base_url, key


async def fixture_thread_token() -> dict[str, str]:
    """Obtain a genuine local user token exactly as the web thread flow does."""
    import httpx

    base_url, key = fixture_cc_connection()
    async with httpx.AsyncClient(trust_env=False, timeout=20) as client:
        response = await client.post(
            f"{base_url.rstrip('/')}/api/v1/internal/ca/user-token/",
            headers={"X-CA-Service-Key": key},
            json={"user_id": AUTHOR_ID},
        )
        response.raise_for_status()
        token = response.json()
    if (
        not isinstance(token.get("access_token"), str)
        or not token["access_token"]
        or token.get("token_type") != "Bearer"
        or not isinstance(token.get("expires_in"), int)
        or token["expires_in"] <= 0
    ):
        raise ValueError("Local fixture token response was invalid")
    issued = datetime.now(UTC)
    return {
        "access_token": token["access_token"],
        "issued_at": issued.isoformat(),
        "expires_at": (issued + timedelta(seconds=token["expires_in"])).isoformat(),
    }


async def seed_fixture(ca_url: str, cnb_url: str) -> dict[str, object]:
    """Append a fresh normal-author run and confirmed synthetic chapter baseline."""
    validated_ca = isolated_database_url(ca_url)
    validated_cnb = isolated_database_url(cnb_url)
    token_context = await fixture_thread_token()
    ca_engine = create_async_engine(validated_ca, poolclass=NullPool)
    cnb_engine = create_async_engine(validated_cnb, poolclass=NullPool)
    run_id, thread_id = uuid4(), uuid4()
    chapter_ids: list[UUID] = []
    try:
        # Match the real chat workflow binding and ready context contract.
        async with async_sessionmaker(ca_engine)() as session, session.begin():
            session.add(
                Thread(
                    thread_id=thread_id,
                    user_id=AUTHOR_ID,
                    title="CC-732 synthetic editing test",
                    context={
                        **token_context,
                        "concept_note_run_id": str(run_id),
                        "city_id": CITY_ID,
                    },
                )
            )
            session.add(
                ConceptNoteRun(
                    run_id=run_id,
                    thread_id=thread_id,
                    user_id=AUTHOR_ID,
                    city_id=CITY_ID,
                    name="CC-732 synthetic concept note",
                    workflow_step="editing_document",
                    context_summary={
                        "context_bundle": {
                            "status": "ready",
                            "document_grounding": "none",
                        },
                        "draft_document": {
                            "status": "completed",
                            "completed_chapters": 3,
                            "total_chapters": 3,
                        },
                    },
                    permission_summary={},
                    idempotency_key=uuid4(),
                    request_fingerprint=hashlib.sha256(
                        str(run_id).encode()
                    ).hexdigest(),
                )
            )
            session.add(
                ConceptNoteContextBundle(
                    run_id=run_id,
                    context_bundle=Bundle().model_dump(mode="json"),
                )
            )

        # Seed full immutable revisions and exact-review pointers, not UI mocks.
        async with async_sessionmaker(cnb_engine)() as session, session.begin():
            for position, (title, body) in enumerate(CHAPTERS):
                chapter_id, revision_id = uuid4(), uuid4()
                chapter_ids.append(chapter_id)
                chapter = ConceptNoteChapter(
                    chapter_id=chapter_id,
                    run_id=run_id,
                    title=title,
                    template_section_id=f"chapter-{position + 1}",
                    position=position,
                    status="ready",
                    required=True,
                    user_locked=False,
                )
                session.add(chapter)
                await session.flush()
                session.add(
                    ConceptNoteChapterRevision(
                        revision_id=revision_id,
                        chapter_id=chapter_id,
                        revision_number=1,
                        author_type="user",
                        change_type="draft",
                        body_markdown=body,
                        patch_summary={"fixture": "CC-732 synthetic"},
                    )
                )
                await session.flush()
                chapter.confirmed_revision_id = revision_id
                session.add(
                    ConceptNoteChapterReview(
                        chapter_id=chapter_id,
                        revision_id=revision_id,
                        user_id=AUTHOR_ID,
                        idempotency_key=uuid4(),
                    )
                )
        return {
            "run_id": str(run_id),
            "thread_id": str(thread_id),
            "user_id": AUTHOR_ID,
            "city_id": CITY_ID,
            "chapter_ids": [str(chapter_id) for chapter_id in chapter_ids],
            "route": f"/en/cities/{CITY_ID}/concept-notes/{run_id}/",
        }
    finally:
        await ca_engine.dispose()
        await cnb_engine.dispose()


class SyntheticModelRunner:
    """Deterministic model-only substitute; real planner validation/tools still run."""

    @staticmethod
    async def run(agent: Any, input: str, **kwargs: Any) -> SimpleNamespace:
        """Return exact known fixture anchors through the real planner parser."""
        if agent.name != "Concept Note edit planner":
            raise RuntimeError("This fixture permits only the CNB edit model")
        payload = json.loads(input)
        instruction = payload["instruction"]
        chapters = payload["chapters"]
        changes: list[dict[str, Any]] = []
        replacements: list[tuple[str, str, str, str]] = []
        prior = payload.get("prior_proposal")
        if prior and re.search(r"\b(?:shorter|shorten)\b", instruction, re.IGNORECASE):
            previous_opening = next(
                (
                    change
                    for change in prior.get("changes", [])
                    if change.get("before")
                    == "The project will create a park that is resilient to floods."
                    and change.get("after")
                    == "The project will create a flood-resilient park."
                ),
                None,
            )
            if previous_opening:
                replacements.append(
                    (
                        previous_opening["before"],
                        "The project will build a flood-resilient park.",
                        "wording",
                        "clarity",
                    )
                )
        if "investment" in instruction.lower():
            value = re.search(r"EUR\s+(\d+)\s+million", instruction, re.IGNORECASE)
            if not value:
                return SimpleNamespace(
                    final_output={
                        "intent": "clarification",
                        "changes": [],
                        "clarification": "What investment amount should I use?",
                    }
                )
            replacements.append(
                ("EUR 10 million", f"EUR {value[1]} million", "factual", "investment")
            )
        if "2031" in instruction:
            replacements.append(("2030", "2031", "factual", "delivery"))
        if not replacements:
            replacements.append(
                (
                    "The project will create a park that is resilient to floods.",
                    "The project will create a flood-resilient park.",
                    "wording",
                    "clarity",
                )
            )

        for before, after, kind, group in replacements:
            if before == after:
                continue
            for chapter in chapters:
                body = chapter["body_markdown"] or ""
                for match in re.finditer(re.escape(before), body):
                    changes.append(
                        {
                            "chapter_id": chapter["chapter_id"],
                            "start": match.start(),
                            "before": before,
                            "after": after,
                            "kind": kind,
                            "group_id": group,
                            "source_refs": [],
                            "user_input_quote": (
                                instruction if kind == "factual" else None
                            ),
                        }
                    )
        if not changes:
            output = {
                "intent": "clarification",
                "changes": [],
                "clarification": "Which text should I change?",
            }
        else:
            output = {"intent": "edit", "changes": changes, "clarification": None}
        return SimpleNamespace(final_output=output)

    @staticmethod
    def run_streamed(agent: Any, input: Any, **kwargs: Any) -> SimpleNamespace:
        """Execute the genuine authorized proposal tool from deterministic chat intent."""
        from agents import RunConfig
        from agents.tool_context import ToolContext

        async def events() -> AsyncIterator[SimpleNamespace]:
            messages = (
                input
                if isinstance(input, list)
                else [{"role": "user", "content": input}]
            )
            user_text = next(
                (
                    str(message["content"])
                    for message in reversed(messages)
                    if message.get("role") == "user"
                ),
                "",
            )
            edit_intent = bool(
                re.match(
                    r"\s*(please\s+)?(change|update|rewrite|reword|make|replace|improve|shorten|edit)\b",
                    user_text,
                    re.IGNORECASE,
                )
            )
            tool = next(
                (
                    item
                    for item in agent.tools
                    if item.name == "concept_note_edit_propose"
                ),
                None,
            )
            if edit_intent:
                if tool is None:
                    raise RuntimeError("The real proposal tool is not registered")
                call_id = f"fixture-{uuid4()}"
                yield SimpleNamespace(
                    type="run_item_stream_event",
                    name="tool_called",
                    item=SimpleNamespace(
                        raw_item=SimpleNamespace(
                            name=tool.name, call_id=call_id, arguments="{}"
                        )
                    ),
                )
                context = ToolContext(
                    context=None,
                    tool_name=tool.name,
                    tool_call_id=call_id,
                    tool_arguments="{}",
                    run_config=RunConfig(
                        tracing_disabled=True, trace_include_sensitive_data=False
                    ),
                )
                output = await tool.on_invoke_tool(context, "{}")
                yield SimpleNamespace(
                    type="run_item_stream_event",
                    name="tool_output",
                    item=SimpleNamespace(raw_item={"call_id": call_id}, output=output),
                )
                succeeded = json.loads(output).get("success") is True
                text = (
                    "Review the proposed changes before applying them."
                    if succeeded
                    else "No edit proposal was created."
                )
            else:
                text = "This synthetic concept note describes a flood-resilient park. No document changes were made."
            yield SimpleNamespace(
                type="raw_response_event",
                data=SimpleNamespace(type="response.output_text.delta", delta=text),
            )

        return SimpleNamespace(stream_events=events)


def serve_fixture(ca_url: str, cnb_url: str, port: int) -> None:
    """Start real routes with model output substitution and no outward model access."""
    base_url, key = fixture_cc_connection()
    os.environ["CA_DATABASE_URL"] = isolated_database_url(ca_url)
    os.environ["CNB_DATABASE_URL"] = isolated_database_url(cnb_url)
    os.environ.update(
        {
            "OPENROUTER_API_KEY": "cc732-no-live-model",
            "OPENAI_API_KEY": "cc732-no-live-embeddings",
            "MLFLOW_ENABLED": "false",
            "LANGSMITH_API_KEY": "",
            "LANGCHAIN_API_KEY": "",
            "LANGSMITH_TRACING_V2": "false",
            "LANGCHAIN_TRACING_V2": "false",
            "OTEL_SDK_DISABLED": "true",
            "HTTP_PROXY": "http://127.0.0.1:9",
            "HTTPS_PROXY": "http://127.0.0.1:9",
            "NO_PROXY": "127.0.0.1,localhost",
        }
    )
    import uvicorn
    from app.config.settings import get_settings
    from app.services.cnb import edit_planner
    from app.utils import streaming_handler

    settings = get_settings()
    settings.openrouter_api_key = "cc732-no-live-model"
    settings.openai_api_key = "cc732-no-live-embeddings"
    settings.cc_base_url = base_url
    settings.cc_api_key = key
    settings.langsmith_tracing_enabled = False
    original_init = edit_planner.ConceptNoteEditPlanner.__init__

    def fixture_init(self: Any, settings: Any, **kwargs: Any) -> None:
        original_init(self, settings, runner=SyntheticModelRunner)

    # These substitutions exist only in this explicit fixture process. The
    # planner parser/budget, tool authorization, routes, repository, and UI are real.
    edit_planner.ConceptNoteEditPlanner.__init__ = fixture_init
    streaming_handler.Runner = SyntheticModelRunner
    from app.main import app

    uvicorn.run(app, host="127.0.0.1", port=port, access_log=False)


def parse_args() -> argparse.Namespace:
    """Parse a bounded fixture action without opening a database or model client."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "serve"))
    parser.add_argument("--ca-database-url", default=os.getenv("CA_DATABASE_URL"))
    parser.add_argument("--cnb-database-url", default=os.getenv("CNB_DATABASE_URL"))
    parser.add_argument("--port", type=int, default=8082)
    args = parser.parse_args()
    if args.action == "serve" and not 1024 <= args.port <= 65535:
        parser.error("--port must be a local non-privileged test port")
    return args


def main() -> None:
    """Execute one fixture action and print only synthetic identifiers when seeding."""
    args = parse_args()
    if args.action == "seed":
        print(
            json.dumps(
                asyncio.run(seed_fixture(args.ca_database_url, args.cnb_database_url))
            )
        )
    else:
        serve_fixture(args.ca_database_url, args.cnb_database_url, args.port)


if __name__ == "__main__":
    main()
