from fastapi import HTTPException


class ThreadNotFoundException(HTTPException):
    """Exception raised when a thread is not found."""
    def __init__(self, thread_id: str, detail: str = None):
        super().__init__(
            status_code=404,
            detail=detail or f"Thread {thread_id} not found"
        )


class ThreadAccessDeniedException(HTTPException):
    """Exception raised when access to a thread is denied."""
    def __init__(self, detail: str = "Thread does not belong to user"):
        super().__init__(
            status_code=403,
            detail=detail
        )
