from db.database import engine
from fastapi import APIRouter, HTTPException

api_router = APIRouter()


@api_router.get("/health")
def health_check():
    try:
        # Attempt to connect to the database
        with engine.connect():
            return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Service unavailable")
    finally:
        engine.dispose()
