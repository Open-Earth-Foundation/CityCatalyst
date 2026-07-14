from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Return the minimal health payload used by probes and deploy checks."""
    return {"status": "ok"}
