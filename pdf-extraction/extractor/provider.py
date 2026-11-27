"""Thin REST adapter for the documented OpenAI beta Agents API.

Hosted sessions own agent execution; the local controller manages validation/repair.
Only repair messages with a persisted idempotency key may be safely retried.
"""

import base64
import hashlib
import json
import logging
from typing import Any
from pathlib import Path

import httpx
from pydantic import ValidationError

from extractor.config import Settings
from extractor.models import ExtractionResult, SchemaExtractionResult
from extractor.prompting import agent_instructions, resolve_prompts
from extractor.schema import parse_schema, schema_errors
from extractor.ghgi import consistency_issues

LOGGER = logging.getLogger(__name__)
SERVICE = "city-taxonomy-extraction-v1"
RESULT_PATH = "/workspace/outputs/extraction.json"


class ProviderError(Exception):
    """A safe HTTP error for callers, without upstream bodies or credentials."""

    def __init__(
        self,
        status: int,
        detail: str,
        uncertain: bool = False,
        upstream_status: int | None = None,
    ):
        """Store a safe error and whether a mutating request may have succeeded."""
        self.status = status
        self.detail = detail
        self.uncertain = uncertain
        self.upstream_status = upstream_status
        super().__init__(detail)


class AgentsProvider:
    """Submit and inspect extraction sessions through an injected HTTP client."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        """Keep credentials in server memory, outside the agent environment."""
        self.settings = settings
        self.client = client
        self.schemas = {}
        self.schema_dir = (
            Path(settings.state_path).resolve().parent / "input-schemas"
            if settings.state_path != ":memory:"
            else None
        )

    def save_schema(self, file_id: str, schema: dict) -> None:
        """Persist the exact submitted schema: user_data files cannot be downloaded."""
        raw = json.dumps(schema, ensure_ascii=False)
        self.schemas[file_id] = json.loads(raw)
        if self.schema_dir:
            self.schema_dir.mkdir(parents=True, exist_ok=True)
            path = self.schema_dir / (
                hashlib.sha256(file_id.encode()).hexdigest() + ".json"
            )
            path.write_text(raw, encoding="utf-8")

    def saved_schema(self, file_id: str) -> dict | None:
        """Recover a schema after a restart, using a safe hash as its filename."""
        if file_id in self.schemas:
            return self.schemas[file_id]
        if self.schema_dir:
            path = self.schema_dir / (
                hashlib.sha256(file_id.encode()).hexdigest() + ".json"
            )
            if path.is_file():
                return parse_schema(path.read_text(encoding="utf-8"))
        return None

    def forget_schema(self, file_id: str) -> None:
        """Remove a cached schema after its remote input file has been deleted."""
        self.schemas.pop(file_id, None)
        if self.schema_dir:
            path = self.schema_dir / (
                hashlib.sha256(file_id.encode()).hexdigest() + ".json"
            )
            try:
                path.unlink(missing_ok=True)
            except OSError:
                LOGGER.warning("Local schema cleanup pending for file %s", file_id)

    async def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Call OpenAI once and translate failures without leaking PDF contents."""
        try:
            response = await self.client.request(method, path, **kwargs)
        except httpx.TimeoutException as exc:
            raise ProviderError(
                504,
                "OpenAI request timed out; submission outcome may be unknown. Do not blindly resubmit.",
                uncertain=True,
            ) from exc
        except httpx.RequestError as exc:
            raise ProviderError(
                502,
                "Could not reach OpenAI; submission outcome may be unknown.",
                uncertain=True,
            ) from exc
        if not response.is_success:
            request_id = response.headers.get("x-request-id", "unavailable")
            LOGGER.warning(
                "OpenAI request failed: status=%s request_id=%s",
                response.status_code,
                request_id,
            )
            status = (
                response.status_code if response.status_code in {404, 409, 429} else 502
            )
            raise ProviderError(
                status,
                f"OpenAI returned HTTP {response.status_code}; request ID: {request_id}",
                uncertain=response.status_code >= 500,
                upstream_status=response.status_code,
            )
        return response

    async def submit(
        self,
        city: str,
        city_pdf: bytes,
        taxonomy_pdf: bytes | None,
        city_pages: int,
        taxonomy_pages: int,
        data_schema: dict | None = None,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        ocr_context: dict | None = None,
        auto_repair: bool = False,
        max_repairs: int = 3,
    ) -> dict:
        """Upload inputs and start one hosted turn; retain files until job deletion."""
        prompts = resolve_prompts(system_prompt, user_prompt)
        file_ids = []
        source_files = [("city.pdf", city_pdf, "application/pdf")]
        if taxonomy_pdf is not None:
            source_files.append(("taxonomy.pdf", taxonomy_pdf, "application/pdf"))
        else:
            source_files.append(
                (
                    "data.schema.json",
                    json.dumps(data_schema).encode(),
                    "application/json",
                )
            )
        if ocr_context is not None:
            ocr_bytes = json.dumps(ocr_context, ensure_ascii=False).encode("utf-8")
            if len(ocr_bytes) > self.settings.max_result_bytes:
                raise ProviderError(
                    502, "Combined OCR context exceeds the 20 MiB demo limit."
                )
            source_files.append(("ocr-context.json", ocr_bytes, "application/json"))
        try:
            for name, data, media_type in source_files:
                response = await self.request(
                    "POST",
                    "/v1/files",
                    data={"purpose": "user_data"},
                    files={"file": (name, data, media_type)},
                )
                file_ids.append(response.json()["id"])
        except ProviderError:
            await self.cleanup_files(file_ids)
            raise
        result_model = (
            SchemaExtractionResult if data_schema is not None else ExtractionResult
        )
        if data_schema is not None:
            try:
                self.save_schema(file_ids[1], data_schema)
            except OSError as exc:
                await self.cleanup_files(file_ids)
                raise ProviderError(
                    503,
                    "Could not save the submitted schema locally; no agent session was started.",
                ) from exc
        schema = json.dumps(result_model.model_json_schema()).encode()
        inputs = {
            "city": city,
            "city_pdf": "/workspace/city.pdf",
            "taxonomy_pdf": "/workspace/taxonomy.pdf",
            "city_page_count": city_pages,
            "taxonomy_page_count": taxonomy_pages,
            "result_schema": "/workspace/result.schema.json",
            "result_path": RESULT_PATH,
            "ocr_context": (
                "/workspace/ocr-context.json" if ocr_context is not None else None
            ),
            "definition_mode": (
                "json_schema" if data_schema is not None else "taxonomy_pdf"
            ),
            "data_schema": (
                "/workspace/data.schema.json" if data_schema is not None else None
            ),
        }
        if data_schema is not None:
            inputs["taxonomy_pdf"] = None
        payload = {
            "agent": {
                "model": self.settings.model,
                "reasoning": {"effort": self.settings.reasoning_effort},
                "instructions": agent_instructions(prompts["system_prompt"]),
                "multi_agent": {"enabled": False},
            },
            "environment": {
                "type": "openai_hosted",
                "container_size": "medium",
                "network": {"access": "disabled"},
                "packages": {
                    "python": ["pdfplumber", "pypdf", "Pillow", "jsonschema"],
                    "system": [
                        "poppler-utils",
                        "tesseract-ocr",
                        "tesseract-ocr-eng",
                        "tesseract-ocr-spa",
                        "tesseract-ocr-por",
                    ],
                },
                "files": [
                    {
                        "type": "file_id",
                        "file_id": file_ids[0],
                        "path": inputs["city_pdf"],
                    },
                    {
                        "type": "file_id",
                        "file_id": file_ids[1],
                        "path": (
                            inputs["data_schema"]
                            if data_schema is not None
                            else inputs["taxonomy_pdf"]
                        ),
                    },
                    {
                        "type": "inline",
                        "data": base64.b64encode(schema).decode(),
                        "path": inputs["result_schema"],
                    },
                ],
                "setup_commands": [
                    {
                        "command": "mkdir -p /workspace/outputs && python -c 'import pdfplumber, pypdf, PIL, jsonschema' && command -v pdftoppm && command -v tesseract"
                    }
                ],
            },
            "metadata": {
                "service": SERVICE,
                "city": city,
                "city_pages": str(city_pages),
                "taxonomy_pages": str(taxonomy_pages),
                "city_file_id": file_ids[0],
                "definition_mode": inputs["definition_mode"],
                "ocr_provider": "mistral" if ocr_context is not None else "none",
                "auto_repair": str(auto_repair).lower(),
                "max_repairs": str(max_repairs),
                (
                    "schema_file_id" if data_schema is not None else "taxonomy_file_id"
                ): file_ids[1],
            },
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": json.dumps(inputs)},
                        {"type": "input_text", "text": prompts["user_prompt"]},
                    ],
                }
            ],
            "stream": False,
        }
        if ocr_context is not None:
            payload["environment"]["files"].append(
                {
                    "type": "file_id",
                    "file_id": file_ids[2],
                    "path": inputs["ocr_context"],
                }
            )
            payload["metadata"].update(
                ocr_file_id=file_ids[2], ocr_model=ocr_context["model"]
            )
        try:
            response = await self.request("POST", "/v1/agents/sessions", json=payload)
        except ProviderError as exc:
            # A timeout or 5xx can happen after acceptance. Preserve inputs so a
            # potentially running session can finish; log only resource IDs.
            if exc.uncertain:
                LOGGER.error(
                    "Session submission uncertain; reconcile sessions/files in OpenAI project. files=%s",
                    file_ids,
                )
            else:
                await self.cleanup_files(file_ids)
            raise
        return response.json()

    async def cleanup_files(self, file_ids: list[str]) -> list[str]:
        """Delete known input files; return IDs requiring a manual retry."""
        failed = []
        for file_id in file_ids:
            try:
                await self.request("DELETE", f"/v1/files/{file_id}")
            except ProviderError as exc:
                if exc.status != 404:
                    failed.append(file_id)
                    LOGGER.warning("File cleanup pending: %s", file_id)
                    continue
            self.forget_schema(file_id)
        return failed

    async def session(self, job_id: str) -> dict:
        """Only expose sessions created by this service, not other project agents."""
        response = await self.request("GET", f"/v1/agents/sessions/{job_id}")
        session = response.json()
        if session.get("metadata", {}).get("service") != SERVICE:
            raise ProviderError(404, "Extraction job not found.")
        return session

    async def list_all(self, path: str) -> list[dict]:
        """Follow every cursor page, rejecting malformed or repeated cursors."""
        records, seen = [], set()
        params = {"limit": 100, "order": "desc"}
        while True:
            response = await self.request("GET", path, params=params)
            page = response.json()
            records.extend(page["data"])
            if not page.get("has_more"):
                return records
            cursor = page.get("last_id")
            if not cursor or cursor in seen:
                raise ProviderError(
                    502, "OpenAI returned an invalid pagination cursor."
                )
            seen.add(cursor)
            params["after"] = cursor

    async def inspect(self, job_id: str) -> tuple[dict, dict | None, str]:
        """Determine success from a root turn, never from an idle session alone."""
        session = await self.session(job_id)
        turns = await self.list_all(f"/v1/agents/sessions/{job_id}/turns")
        turn = next((item for item in turns if item.get("subagent_id") is None), None)
        if session.get("status") == "failed":
            return session, turn, "failed"
        if session.get("status") == "requires_action":
            return session, turn, "needs_input"
        if session.get("status") == "in_progress" and (
            not turn or turn["status"] in {"completed", "failed", "cancelled"}
        ):
            # A newly accepted continuation can precede publication of its turn.
            return session, turn, "running"
        if turn and turn["status"] in {"completed", "failed", "cancelled"}:
            return session, turn, turn["status"]
        return session, turn, "running" if turn else "queued"

    async def result(self, job_id: str) -> dict:
        """Read the completed turn's artifact and validate structure and sources."""
        session, turn, status = await self.inspect(job_id)
        if status != "completed":
            raise ProviderError(409, f"Result unavailable; job status is {status}.")
        artifacts = await self.list_all(f"/v1/agents/sessions/{job_id}/artifacts")
        artifact = next(
            (
                item
                for item in artifacts
                if item["turn_id"] == turn["id"] and item["path"] == RESULT_PATH
            ),
            None,
        )
        if artifact is None:
            raise CandidateError(
                502,
                "The completed agent did not publish /workspace/outputs/extraction.json as an artifact for this turn.",
            )
        if artifact["size_bytes"] > self.settings.max_result_bytes:
            raise CandidateError(
                502, "The extraction result exceeds the configured size limit."
            )
        response = await self.request(
            "GET", f"/v1/agents/sessions/{job_id}/artifacts/{artifact['id']}/content"
        )
        if len(response.content) > self.settings.max_result_bytes:
            raise CandidateError(
                502, "The extraction result exceeds the configured size limit."
            )
        metadata = session["metadata"]
        try:
            data_errors = []
            consistency_errors = []
            if metadata.get("definition_mode") == "json_schema":
                result = SchemaExtractionResult.model_validate_json(response.content)
                warnings = result.check_sources(
                    metadata["city"], int(metadata["city_pages"])
                )
                target_schema = self.saved_schema(metadata["schema_file_id"])
                if target_schema is None:
                    try:
                        schema_response = await self.request(
                            "GET", f"/v1/files/{metadata['schema_file_id']}/content"
                        )
                        target_schema = parse_schema(schema_response.text)
                    except ProviderError as exc:
                        if exc.upstream_status == 400:
                            raise ProviderError(
                                409,
                                "The exact input schema is missing locally and OpenAI cannot return user_data files. Restore the original schema cache or start a new extraction.",
                                upstream_status=400,
                            ) from exc
                        raise
                data_errors = schema_errors(result.data, target_schema)
                if not data_errors:
                    consistency_errors = consistency_issues(result.data, target_schema)
            else:
                result = ExtractionResult.model_validate_json(response.content)
                warnings = result.check_sources(
                    metadata["city"],
                    int(metadata["city_pages"]),
                    int(metadata["taxonomy_pages"]),
                )
        except (ValueError, KeyError) as exc:
            details = (
                [
                    "/".join(map(str, error["loc"])) + ": " + error["msg"]
                    for error in exc.errors(include_input=False, include_url=False)[:30]
                ]
                if isinstance(exc, ValidationError)
                else [str(exc)[:1000]]
            )
            raise CandidateError(
                502,
                "The agent result failed contract or page-reference validation. "
                + "; ".join(details),
            ) from exc
        return {
            "job_id": job_id,
            "preprocessing": {
                "ocr_provider": metadata.get("ocr_provider", "none"),
                "ocr_model": metadata.get("ocr_model"),
            },
            "requires_review": True,
            "validation": {
                "structure_and_page_bounds": "passed",
                "source_accuracy": "not_independently_verified",
                "warnings": warnings,
                "data_schema": (
                    "failed"
                    if data_errors
                    else (
                        "passed"
                        if metadata.get("definition_mode") == "json_schema"
                        else "not_supplied"
                    )
                ),
                "data_schema_errors": data_errors,
                "consistency_errors": consistency_errors,
            },
            "result": result.model_dump(),
        }

    async def repair(self, job_id: str, key: str, message: str) -> None:
        """Continue the same session once per persisted logical repair message."""
        await self.request(
            "POST",
            f"/v1/agents/sessions/{job_id}/events",
            headers={"Idempotency-Key": key},
            json={
                "events": [
                    {
                        "type": "agent.session.input.message",
                        "input": [
                            {
                                "role": "user",
                                "content": [{"type": "input_text", "text": message}],
                            }
                        ],
                    }
                ]
            },
        )

    async def activity(self, job_id: str, full: bool = False) -> dict:
        """Expose public tool records; optionally page all history, never reasoning."""
        await self.session(job_id)
        if full:
            page = {
                "data": await self.list_all(f"/v1/agents/sessions/{job_id}/items"),
                "has_more": False,
            }
        else:
            response = await self.request(
                "GET",
                f"/v1/agents/sessions/{job_id}/items",
                params={"limit": 100, "order": "desc"},
            )
            page = response.json()
        records = []
        for item in reversed(page["data"]):
            kind = item.get("type")
            record = {key: item.get(key) for key in ("id", "turn_id", "type", "status")}
            if kind == "message" and item.get("role") == "assistant":
                record["text"] = "\n".join(
                    block.get("text", "")
                    for block in item.get("content", [])
                    if block.get("type") == "output_text"
                )[:6000]
                record["phase"] = item.get("phase")
            elif kind == "command_execution":
                record.update(
                    command=str(item.get("command", ""))[:4000],
                    output=str(item.get("output") or "")[:6000],
                    exit_code=item.get("exit_code"),
                    duration_ms=item.get("duration_ms"),
                )
            elif kind in {"function_call", "tool_call", "file_change"}:
                record["name"] = str(item.get("name", kind))[:200]
            else:
                continue
            records.append(record)
        return {
            "items": records,
            "has_older_items": bool(page.get("has_more")),
            "note": ("All public session items" if full else "Latest 100 session items")
            + "; text/output truncated. No private reasoning. Tool output can contain document text.",
        }

    async def cancel(self, job_id: str) -> None:
        """Request cancellation; callers must poll until cancellation completes."""
        await self.session(job_id)
        await self.request(
            "POST",
            f"/v1/agents/sessions/{job_id}/events",
            json={"events": [{"type": "agent.session.input.cancel"}]},
        )

    async def delete(self, job_id: str) -> list[str]:
        """Delete a stopped session, then remove its separate Files API inputs."""
        session, _, status = await self.inspect(job_id)
        if status not in {"completed", "failed", "cancelled"}:
            raise ProviderError(
                409, "Cancel the job and wait for it to stop before deleting it."
            )
        await self.request("DELETE", f"/v1/agents/sessions/{job_id}")
        metadata = session["metadata"]
        return await self.cleanup_files(
            [
                metadata[key]
                for key in (
                    "city_file_id",
                    "taxonomy_file_id",
                    "schema_file_id",
                    "ocr_file_id",
                )
                if key in metadata
            ]
        )


class CandidateError(ProviderError):
    """A completed artifact has a repairable output problem, not an API outage."""
