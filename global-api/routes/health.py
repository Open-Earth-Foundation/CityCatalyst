from contextlib import closing
from db.database import engine
from fastapi import APIRouter, HTTPException

api_router = APIRouter()


@api_router.get("/health")
def health_check():
    """
    Check the health of the service by testing the database connection.

    Returns:
        dict: A dictionary containing the status of the service.
    """
    try:
        # Attempt to connect to the database using a context manager
        with closing(engine.connect()):
            return {'status': 'ok'}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Service unavailable")

    

    





