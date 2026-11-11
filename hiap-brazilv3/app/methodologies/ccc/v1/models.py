"""Caller input model of CCC v1 (scaffold)."""

from pydantic import BaseModel, ConfigDict


class PrioritizationInputs(BaseModel):
    """Request-specific inputs accepted by the CCC v1 scaffold.

    The scaffold needs no caller input, so any field is rejected. Real fields
    are added when the methodology defines them.
    """

    model_config = ConfigDict(extra="forbid")
