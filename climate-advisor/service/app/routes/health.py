from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request) -> dict:
    # Marked in app startup
    ready_flag = bool(getattr(request.app.state, "ready", False))
    return {"ready": ready_flag}

