"""
Pydantic models for the v2 API surface.

These types ARE the response-semantics standard, expressed as code instead of prose
(see engineering-standards/api-response-semantics.md). When a v2 endpoint sets one of
these as its `response_model=`, FastAPI does three jobs at once:

  1. ENFORCES the shape   - the response is validated against the model. A route that forgets
                            `unit` or `provenance` fails loudly instead of silently shipping a
                            bare number. The standard stops being a doc people must remember.
  2. DOCUMENTS the shape  - the model is rendered automatically in /api/v2/docs, so the docs
                            always match what the code actually returns (today the hand-built
                            dicts in v1 show nothing in the docs).
  3. STANDARDISES it      - every v2 endpoint composes the same Meta / Provenance / Envelope,
                            so every consumer (the app, a notebook, the MCP) learns ONE
                            structure instead of a different shape per endpoint.

JSON is camelCase (per api-design.md) while Python stays snake_case - the alias generator
bridges the two, so you never hand-write camelCase keys again.
"""
from __future__ import annotations

from datetime import datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class _Base(BaseModel):
    # alias_generator -> camelCase JSON keys; populate_by_name -> we can still build with
    # snake_case in Python (e.g. Provenance(release_id=...)). One rule, applied everywhere.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Provenance(_Base):
    """WHERE a value came from. Matches db.provenance.build_datasources() exactly, which
    reads modelled.dataset_release + modelled.publisher_datasource. Never invented at the
    API layer - if a row can't be traced to a release, that's a data-model gap to fix."""
    release_id: str
    datasource_name: str
    publisher_name: Optional[str] = None
    publisher_url: Optional[str] = None
    dataset_name: Optional[str] = None
    dataset_url: Optional[str] = None
    version_label: Optional[str] = None
    is_latest: Optional[bool] = None


class NotationKey(_Base):
    """WHY a value is absent. Keeps 'does not occur' (NO) distinct from a genuine zero and
    from 'missing'. Content already exists in routes/ghgi_notation_key.py - v2 folds it into
    the value instead of making the caller hit a second endpoint."""
    key: str                       # NO | IE | NE | C
    name: str
    reason: dict[str, str]         # i18n blob: {"en": ..., "pt": ..., "es": ...}
    explanation: dict[str, str]


class Observation(_Base):
    """A measured value that carries its own meaning. This is the emissions/metric shape:
    the number never travels without its unit and calculation context."""
    value: Optional[float]         # null when absent
    unit: str                      # REQUIRED - meaning never lives only in the field name
    gwp: Optional[str] = None
    time_horizon_years: Optional[int] = None     # disambiguates 100yr vs 20yr in the payload
    data_quality: Optional[str] = None
    notation_key: Optional[NotationKey] = None


class MonetaryAmount(_Base):
    """The finance analogue of an Observation: an amount is meaningless without its currency,
    so they travel together as one object instead of two loose fields."""
    value: Optional[float] = None
    currency: Optional[str] = None
    note: Optional[str] = None


class Meta(_Base):
    """WHAT was asked. Echoes the resolved request so a response identifies itself once it's
    been detached from the URL that produced it."""
    generated_at_utc: datetime
    endpoint: str
    request: dict                  # the resolved filters, echoed back
    count: Optional[int] = None
    datasources: list[Provenance] = []


class Envelope(_Base, Generic[T]):
    """Every v2 response is meta + data. One outer structure across the entire surface, so a
    consumer writes one parser, not one per endpoint. `T` is the per-endpoint payload type,
    e.g. Envelope[list[FinanceOpportunity]]."""
    meta: Meta
    data: T
