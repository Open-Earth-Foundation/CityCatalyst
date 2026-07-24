from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from app.models.concept_note_city_context import (
    ConceptNoteCcContext,
    ConceptNoteCityContextRequest,
    ConceptNoteCityContextResponse,
    ConceptNoteContextBundleFragment,
)
from app.repositories.concept_note_city_context import (
    ConceptNoteCityContextRepository,
    ConceptNoteCityContextRepositoryError,
    get_concept_note_city_context_repository,
)
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.services.concept_note_city_context import (
    ConceptNoteCityContextDataError,
    cached_cc_context,
    load_ghgi_context,
    saved_meed_context,
)
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

router = APIRouter()


async def get_citycatalyst_client() -> AsyncIterator[CityCatalystClient]:
    """Provide and close the CityCatalyst client used by the route."""
    client = CityCatalystClient()
    try:
        yield client
    finally:
        await client.close()


def problem(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a stable machine-readable city-context error."""
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "detail": message, "status": status_code},
        media_type="application/problem+json",
    )


@router.post(
    "/concept-notes/{run_id}/cc-context",
    response_model=ConceptNoteCityContextResponse,
    response_model_exclude_unset=True,
)
async def build_concept_note_city_context(
    run_id: UUID,
    payload: ConceptNoteCityContextRequest,
    request: Request,
    repository: Annotated[
        ConceptNoteCityContextRepository,
        Depends(get_concept_note_city_context_repository),
    ],
    cc_client: Annotated[
        CityCatalystClient,
        Depends(get_citycatalyst_client),
    ],
) -> JSONResponse | ConceptNoteCityContextResponse:
    """Build GHGI and optionally return the run's stored MEED snapshot."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not authorization[7:].strip():
        return problem(401, "invalid_bearer_token", "Bearer token is required")
    token = authorization[7:].strip()

    # Resolve the canonical CC identity before reading CNB or city data.
    try:
        user_id = await cc_client.validate_user_identity(token)
    except CityCatalystClientError as exc:
        status_code = 401 if exc.status_code in (401, 403) else 503
        code = (
            "invalid_bearer_token"
            if status_code == 401
            else "cc_identity_unavailable"
        )
        message = (
            "Bearer token is invalid or expired"
            if status_code == 401
            else "Identity service is temporarily unavailable"
        )
        return problem(status_code, code, message)

    # Validate run ownership and immutable city binding before querying GHGI.
    try:
        run_context = await repository.load_run_context(
            user_id=user_id,
            run_id=run_id,
            city_id=payload.city_id,
        )
    except ConceptNoteCityContextRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))

    cached_context = cached_cc_context(
        run_context.context_bundle,
        include_meed=payload.include_meed,
    )
    if cached_context is not None:
        return response_for(
            run_id=run_id,
            city_id=payload.city_id,
            cc_context=cached_context,
        )

    # Build only GHGI; MEED is supplied separately and never triggered here.
    try:
        ghgi_context = await load_ghgi_context(
            cc_client=cc_client,
            user_id=user_id,
            city_id=payload.city_id,
            token=token,
        )
    except CityCatalystClientError as exc:
        if exc.status_code in (403, 404):
            return problem(
                exc.status_code,
                "city_context_forbidden"
                if exc.status_code == 403
                else "city_not_found",
                "City context is not accessible",
            )
        return problem(
            503,
            "cc_context_unavailable",
            "CityCatalyst context is temporarily unavailable",
        )
    except ConceptNoteCityContextDataError:
        return problem(
            503,
            "invalid_cc_context",
            "CityCatalyst returned invalid GHGI context",
        )

    # Persist GHGI under lock without replacing separately supplied MEED.
    try:
        merged_bundle = await repository.merge_ghgi_context(
            user_id=user_id,
            run_id=run_id,
            city_id=payload.city_id,
            ghgi_context=ghgi_context.model_dump(mode="json"),
        )
    except ConceptNoteCityContextRepositoryError as exc:
        return problem(exc.status_code, exc.code, str(exc))

    cc_context = ConceptNoteCcContext(ghgi=ghgi_context)
    if payload.include_meed:
        cc_context = ConceptNoteCcContext(
            ghgi=ghgi_context,
            meed=saved_meed_context(merged_bundle),
        )
    return response_for(
        run_id=run_id,
        city_id=payload.city_id,
        cc_context=cc_context,
    )


def response_for(
    *,
    run_id: UUID,
    city_id: UUID,
    cc_context: ConceptNoteCcContext,
) -> ConceptNoteCityContextResponse:
    """Wrap the persisted CityCatalyst fragment in the public response envelope."""
    return ConceptNoteCityContextResponse(
        run_id=run_id,
        city_id=city_id,
        context_bundle=ConceptNoteContextBundleFragment(
            cc_context=cc_context,
        ),
    )
