"""Read accepted point authority independently of mutable workflow tasks."""

from typing import Any


def accepted_point_reason(snapshot: dict[str, Any] | None) -> str | None:
    """Return the basis frozen at acceptance, including older accepted-note records."""
    if not snapshot:
        return None
    reason = snapshot.get("reason")
    if reason is None:
        reason = (snapshot.get("task") or {}).get("note")
    return reason if isinstance(reason, str) else None
