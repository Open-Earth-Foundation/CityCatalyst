"""API error shaping."""

from typing import Any

from app.registry import UnsupportedCombinationError

UNSUPPORTED_COMBINATION_CODE = "unsupported_combination"


def unsupported_combination_detail(
    error: UnsupportedCombinationError, request_id: str
) -> dict[str, Any]:
    """Build the error body for an unsupported combination.

    The requested region, methodology and version are always listed. `modality`
    and `supportedModalities` are listed only when the modality is the reason.

    Args:
        error: The registry error.
        request_id: Caller correlation ID.

    Returns:
        JSON-serializable body for an HTTP 422 response.
    """
    details: dict[str, Any] = {
        "region": error.region,
        "methodology": error.methodology,
        "methodologyVersion": error.methodology_version,
    }
    if error.modality_is_reason:
        details["modality"] = error.modality
        details["supportedModalities"] = error.supported_modalities
    return {
        "requestId": request_id,
        "error": {
            "code": UNSUPPORTED_COMBINATION_CODE,
            "message": str(error),
            "details": details,
        },
    }
