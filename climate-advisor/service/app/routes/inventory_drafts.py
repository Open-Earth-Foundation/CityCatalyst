from __future__ import annotations

from fastapi import APIRouter

from ..models.draft_review import SectorDraftLLMOutput, SectorDraftRequest
from ..services.draft_inventory_service import generate_stationary_energy_draft

router = APIRouter(prefix="/inventory-drafts", tags=["inventory-drafts"])


@router.post("/stationary-energy", response_model=SectorDraftLLMOutput)
async def draft_stationary_energy(
    request: SectorDraftRequest,
) -> SectorDraftLLMOutput:
    return generate_stationary_energy_draft(request)
