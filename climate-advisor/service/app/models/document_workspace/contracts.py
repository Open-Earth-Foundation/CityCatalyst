"""Browser and scoped-tool contracts for the canonical document workspace."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StrictFloat, StrictInt


class Contract(BaseModel):
    """Reject unknown command fields instead of silently ignoring them."""

    model_config = ConfigDict(extra="forbid")


class DocumentPointCitation(Contract):
    """A quotation verified against one immutable source artifact."""

    source_label: str
    quote: str
    page_number: int | None = None
    source_anchor: str | None = None


class DocumentPointCandidate(Contract):
    """An unaccepted typed value with retained source evidence."""

    candidate_id: str
    value: JsonValue
    citations: list[DocumentPointCitation]
    status: Literal["pending", "accepted", "dismissed"]


class DocumentPointTask(Contract):
    """Work coordination independent of whether a fact is accepted."""

    status: Literal["active", "parked", "waiting", "done"]
    waiting_for: str | None = None
    requested_information: str | None = None
    note: str | None = None


class DocumentWorkspacePoint(Contract):
    """One semantic fact or decision, shared by its declared chapters."""

    point_id: str
    key: str
    label: str
    description: str
    kind: Literal["fact", "decision"]
    answer_type: Literal["text", "number", "date", "choice", "multiline"]
    choices: list[str] = Field(default_factory=list)
    required: bool
    allow_assumption: bool
    allow_not_applicable: bool
    version: int
    status: Literal[
        "missing",
        "needs_confirmation",
        "conflict",
        "answered",
        "assumption",
        "not_applicable",
    ]
    value: JsonValue = None
    accepted_reason: str | None = None
    unit: str | None = None
    accepted_candidate_id: str | None = None
    chapter_refs: list[str]
    candidates: list[DocumentPointCandidate]
    task: DocumentPointTask | None = None
    freshness: Literal[
        "missing", "current", "stale", "updating", "pending_review", "failed"
    ]


class DocumentNeedDocument(Contract):
    """Attached run source, rather than a parallel file store."""

    upload_id: str
    source_label: str
    filename: str
    source_format: Literal["pdf", "markdown"]
    ready: bool


class DocumentWorkspaceNeed(Contract):
    """An evidence need can support several points."""

    need_id: str
    key: str
    label: str
    description: str
    required: bool
    status: Literal["available", "missing", "later", "waiting", "unavailable"]
    point_keys: list[str]
    guidance: str
    documents: list[DocumentNeedDocument]


class DocumentWorkspaceSetup(Contract):
    """Versioned immutable setup snapshot identity."""

    name: str
    document_type: str
    version: int
    fingerprint: str
    ready: bool


class DocumentNextStep(Contract):
    """Deterministic next unresolved work item."""

    point_id: str
    label: str
    reason: str


class DocumentWorkspaceOverview(Contract):
    """Coverage counters computed using the export policy."""

    required_total: int
    required_covered: int
    optional_total: int
    optional_covered: int
    waiting_count: int
    next_steps: list[DocumentNextStep]


class DocumentExportEligibility(Contract):
    """Server-enforced export gates at one workspace revision."""

    working: bool
    final: bool
    blockers: list[str]
    workspace_revision: int


class DocumentWorkspace(Contract):
    """Single projection consumed by Overview, Context, To do and chat."""

    revision: int
    setup: DocumentWorkspaceSetup | None
    points: list[DocumentWorkspacePoint]
    needs: list[DocumentWorkspaceNeed]
    overview: DocumentWorkspaceOverview
    export_eligibility: DocumentExportEligibility


class DocumentPointCommand(Contract):
    """A versioned, idempotent human operation on a point."""

    command: Literal[
        "answer",
        "confirm_candidate",
        "correct",
        "park",
        "resume",
        "assume",
        "not_applicable",
        "dismiss_candidate",
    ]
    expected_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=200)
    value: JsonValue = None
    candidate_id: str | None = None
    reason: str | None = Field(default=None, max_length=4000)
    waiting_for: str | None = Field(default=None, max_length=1000)
    requested_information: str | None = Field(default=None, max_length=4000)
    note: str | None = Field(default=None, max_length=4000)


class DocumentUpdateJob(Contract):
    """Durable accepted-answer propagation status."""

    job_id: str
    status: str


class DocumentPointCommandResult(Contract):
    """Acceptance completes independently of background drafting."""

    point: DocumentWorkspacePoint
    workspace_revision: int
    update_job: DocumentUpdateJob | None = None


class DocumentPointSubquestion(Contract):
    """One bounded question and optional choices."""

    question: str = Field(min_length=1, max_length=2000)
    options: list[str] = Field(default_factory=list, max_length=8)


class DocumentPointQuestion(Contract):
    """Read-only configured question output."""

    pattern: Literal[
        "confirm", "evidence", "quick_pick", "short_form", "compare", "decision"
    ]
    why_asking: str = Field(min_length=1, max_length=2000)
    questions: list[DocumentPointSubquestion] = Field(min_length=1, max_length=6)


class DocumentSetupRequest(Contract):
    """Reconcile the authorized run's currently selected template explicitly."""

    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=1, max_length=200)
    document_type: Literal["concept_note"] = "concept_note"


class DocumentExportRequest(Contract):
    """Export exactly the revision the user reviewed."""

    mode: Literal["working", "final"]
    expected_revision: int = Field(ge=0)


class DocumentExportResponse(Contract):
    """Persisted export snapshot with explicit working-draft caveats."""

    export_id: str
    mode: Literal["working", "final"]
    workspace_revision: int
    caveats: list[str]
    body_markdown: str


class ExtractedPointCandidate(Contract):
    """Model output uses local quote positions; source identities stay in code."""

    # Recursive JsonValue becomes an untyped {} definition in the SDK's strict
    # response schema. The supported point types require only these scalars.
    value: str | StrictInt | StrictFloat
    evidence_positions: list[int] = Field(min_length=1, max_length=20)


class PointExtraction(Contract):
    """No candidate is a valid reading when evidence does not answer the point."""

    candidates: list[ExtractedPointCandidate] = Field(
        default_factory=list, max_length=8
    )
