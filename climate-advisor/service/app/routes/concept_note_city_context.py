from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from app.models.cnb.concept_note_city_context import (
    ConceptNoteCcContext,
    ConceptNoteCityContextRequest,
    ConceptNoteCityContextResponse,
    ConceptNoteContextBundleFragment,
    GhgiContext,
    HiapContext,
)
from app.persistence.concept_notes.city_context import (
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
    cached_ghgi_context,
    cached_hiap_context,
    inventory_uuid,
    load_accessible_inventory,
    load_ghgi_context,
    load_hiap_context,
    missing_hiap_context,
)
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger(__name__)

REPOSITORY_PROBLEMS: dict[str, tuple[int, str]] = {
    "concept_note_run_not_found": (404, "Concept Note run was not found"),
    "concept_note_run_forbidden": (
        403,
        "Concept Note run belongs to another user",
    ),
    "run_city_mismatch": (
        409,
        "Requested city does not match the Concept Note run",
    ),
    "cnb_storage_unavailable": (
        503,
        "Concept Note context storage is not available",
    ),
}
DEFAULT_REPOSITORY_PROBLEM = (
    503,
    "cnb_storage_unavailable",
    "Concept Note context storage is not available",
)


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


def repository_problem(error: ConceptNoteCityContextRepositoryError) -> JSONResponse:
    """Translate a repository error without exposing its internal message."""
    public_problem = REPOSITORY_PROBLEMS.get(error.code)
    if public_problem is None:
        logger.error(
            "Unhandled city-context repository error code: %s",
            error.code,
            exc_info=error,
        )
        status_code, code, message = DEFAULT_REPOSITORY_PROBLEM
        return problem(status_code, code, message)

    status_code, message = public_problem
    return problem(status_code, error.code, message)


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
    """Build GHGI and optionally persisted HIAP for one accessible inventory."""
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
        return repository_problem(exc)

    # Revalidate live city access before using any cached city context.
    try:
        selected_inventory = await load_accessible_inventory(
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
            "CityCatalyst returned invalid city context",
        )

    selected_inventory_id = (
        inventory_uuid(selected_inventory)
        if selected_inventory is not None
        else None
    )
    ghgi_context = cached_ghgi_context(run_context.context_bundle)
    if not ghgi_matches_inventory(ghgi_context, selected_inventory_id):
        ghgi_context = None

    hiap_context = (
        cached_hiap_context(run_context.context_bundle)
        if payload.include_hiap
        else None
    )
    if not hiap_matches_request(
        hiap_context,
        selected_inventory_id,
        payload.language,
    ):
        hiap_context = None

    new_ghgi_context: GhgiContext | None = None
    new_hiap_context: HiapContext | None = None
    try:
        if ghgi_context is None:
            new_ghgi_context = await load_ghgi_context(
                cc_client=cc_client,
                user_id=user_id,
                city_id=payload.city_id,
                selected_inventory=selected_inventory,
                token=token,
            )
            ghgi_context = new_ghgi_context
        if payload.include_hiap and hiap_context is None:
            new_hiap_context = (
                missing_hiap_context(language=payload.language)
                if selected_inventory is None
                else await load_hiap_context(
                    cc_client=cc_client,
                    user_id=user_id,
                    city_id=payload.city_id,
                    selected_inventory=selected_inventory,
                    language=payload.language,
                    token=token,
                )
            )
            hiap_context = new_hiap_context
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
            "CityCatalyst returned invalid city context",
        )

    # Persist only sections built in this request under one repository lock.
    if new_ghgi_context is not None or new_hiap_context is not None:
        try:
            await repository.merge_cc_context(
                user_id=user_id,
                run_id=run_id,
                city_id=payload.city_id,
                ghgi_context=(
                    new_ghgi_context.model_dump(mode="json")
                    if new_ghgi_context is not None
                    else None
                ),
                hiap_context=(
                    new_hiap_context.model_dump(mode="json")
                    if new_hiap_context is not None
                    else None
                ),
            )
        except ConceptNoteCityContextRepositoryError as exc:
            return repository_problem(exc)

    cc_context = (
        ConceptNoteCcContext(ghgi=ghgi_context, hiap=hiap_context)
        if payload.include_hiap
        else ConceptNoteCcContext(ghgi=ghgi_context)
    )
    return response_for(
        run_id=run_id,
        city_id=payload.city_id,
        cc_context=cc_context,
    )


def ghgi_matches_inventory(
    context: GhgiContext | None,
    inventory_id: UUID | None,
) -> bool:
    """Return whether cached GHGI belongs to the current inventory selection."""
    if context is None:
        return False
    if inventory_id is None:
        return context.availability == "missing" and context.inventory is None
    return context.inventory is not None and context.inventory.id == inventory_id


def hiap_matches_request(
    context: HiapContext | None,
    inventory_id: UUID | None,
    language: str,
) -> bool:
    """Return whether cached HIAP matches the inventory and language request."""
    if context is None:
        return False
    return (
        context.inventory_id == inventory_id
        and context.requested_language == language
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
