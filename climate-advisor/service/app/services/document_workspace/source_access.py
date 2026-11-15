"""Revalidate current source availability at explicit acceptance and export."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import HTTPException

from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.utils.citycatalyst_auth import extract_bearer_token


def document_source_validator(
    authorization: str | None,
) -> Callable[[list[dict[str, Any]]], Awaitable[None]]:
    """Bind the caller's credential outside source content and model inputs."""
    token = extract_bearer_token(authorization)

    async def validate(sources: list[dict[str, Any]]) -> None:
        """Check the requested accepted-value and exported-revision source vector."""
        if not sources:
            return
        client = CityCatalystClient()
        try:
            checked: set[tuple[str, str]] = set()
            for source in sources:
                identity = (
                    str(source.get("upload_id") or ""),
                    str(source.get("sha256") or ""),
                )
                if identity in checked:
                    continue
                checked.add(identity)
                await client.verify_concept_note_source(
                    upload_id=identity[0], token=token, expected_sha256=identity[1]
                )
        except CityCatalystClientError as exc:
            status = 503 if exc.status_code and exc.status_code >= 500 else 409
            raise HTTPException(
                status,
                "A supporting source is unavailable or changed. Review the source-backed answer.",
            ) from exc
        finally:
            await client.close()

    return validate
