# CC-1170: Generalize current CNB tools into shared Clima capabilities

Proposal reframed November 7, 2026. Repository and PR evidence remains the November 6 snapshot at `c41bd0ba2e0d165809e376380f1d93de79822913`; pending PR heads are identified separately. This revision changes the direction of the proposal, not its evidence date. The Stationary Energy comparison, the AgenticModuleScope alignment, database ownership and the migration plan were added on November 9, 2026 against `develop` at `2ac6ac166`. The full module and prompt map is in [CC-1170-CNB-Module-Map.md](CC-1170-CNB-Module-Map.md).

## Objective

Generalize the tools and frontend components currently implemented in CNB into shared Clima capabilities for main chat, agentic flows, document workspaces and future surfaces. Include guided questions, answer/gap collection, visuals, source interaction, proposals, edit review and accepted-change handling. Make compatible implementations replaceable behind those capabilities.

CNB names the current source implementation; Clima owns the target shared capabilities. Resource-specific permissions, document schemas, revision rules and allowed operations become explicit dependencies. This is a path for generalizing behavior and proving reuse. It does not prescribe new APIs, request fields, class names, a registry, a provider, a Clima feature or a production rollout. The target paths in the module map are a packaging proposal for stage 6, not a precondition for stages 1–5. Current code excerpts below are evidence, not proposed implementation.

## Generalization, reuse and replacement

1. Generalization: separate common capability behavior from assumptions of the current feature.
2. Reuse: consume the same Clima tools and components across main chat, agentic flows and document workspaces.
3. Replacement: vary a compatible implementation without rewriting these consumers.

Shared SSE transport, common agent execution and OCR infrastructure are existing starting points. The path should clarify remaining coupling before introducing more machinery.

## Candidate boundaries

### Interaction and result components (Clima frontend)

Observed coupling: Choices and visuals currently have CNB-specific parsers, message state and saved-history handling. Gap forms and review controls also live in that feature.

Direction: Generalize display, answer collection and review components into reusable Clima interactions. Separate tool-output interpretation from rendering and state handling.

Keep stable: Interaction meaning, partial and answered states, safe rendering, review decisions and saved-state behavior.

Potential variation: The consuming surface, compatible result producer and resource-specific input data.

Target responsibility: Clima owns the reusable interaction components, including gap collection and edit review. Each surface supplies its session and resource context.

Open question: Which interaction modes need distinct contracts? Immediate conversational replies and collected answers can both be reusable without being forced into one behavior.

### Tool composition and execution (Clima backend)

Observed coupling: Shared AgentService / StreamingHandler execution already exists, while CNB prompt, readiness and tool binding are tied to its run context.

Direction: Generalize tools and their execution dependencies as Clima capabilities that different conversations and tasks can compose.

Keep stable: Execution lifecycle, result delivery, error handling, observability and allowed-action constraints.

Potential variation: The compatible implementation supplying a capability and the set of capabilities available to a surface or task.

Target responsibility: Clima owns shared tool behavior and composition boundaries. Eligible resource context and permissions determine what an invocation may do.

Open question: Which current selection and execution assumptions tie a tool to one feature, and what must become explicit for reuse elsewhere?

### Context and authorization (Clima + resource context)

Observed coupling: A CNB run currently has user, city and thread constraints. Its run binding selects feature-specific behavior.

Direction: Make each generalized Clima capability consume the authorized context it needs instead of requiring the original feature run or screen.

Keep stable: Resource identity, current access checks, readiness and permitted operations.

Potential variation: The document type, task or conversation supplying the required context.

Target responsibility: Clima capabilities use explicit resource permissions and policies. Reuse does not bypass checks or require the original feature to remain the capability owner.

Open question: Which context is essential to the operation, and which is incidental to the current implementation? Preserve identity semantics while removing unnecessary feature coupling.

### Source and evidence capabilities (Clima backend + data)

Observed coupling: Shared OCR and document-pool work already exist. Registration, catalog publication, readiness and authorized reading remain distinct responsibilities.

Direction: Generalize grounded source interaction into Clima capabilities, with source resolution and resource policies expressed as dependencies.

Keep stable: Authorized scope, immutable artifact identity, exact evidence locations and source lifecycle restrictions.

Potential variation: Reader or processing implementation, supported resource type and consuming surface.

Target responsibility: Clima owns shared source-interaction behavior. Resource-specific resolution, visibility and readiness constrain each invocation without owning the whole tool.

Open question: What source guarantees can a common Clima capability promise across resource types? Pooling bytes alone does not establish that contract.

### Proposal, review and application (Clima frontend + backend)

Observed coupling: In the current feature, question generation, answer collection, proposals, review and revision-checked application are separate state transitions.

Direction: Generalize collection, proposal and review behavior into Clima capabilities, including the reusable lifecycle for applying accepted changes. Express document operations and policies explicitly.

Keep stable: Explicit acceptance where required, revision validation, retry identity, provenance and persisted application state.

Potential variation: The host, proposal-producing tool, resource schema and authorized change operation.

Target responsibility: Clima owns the reusable collection, review and accepted-change flow. Resource-specific mutation rules are explicit dependencies of these shared capabilities.

Open question: Which review and apply behaviors are common, and which depend on the target resource? Preserve the guarantees while removing the original feature dependency.

## Proposed stages

### 1. Map capabilities in their current implementation

Outcome: An inventory of the tools and UI behaviors currently implemented in CNB that should become reusable Clima capabilities.

Work: Trace questions, answer collection, visuals, source interaction, proposals, review and application across frontend and backend. Identify hardcoded run, chapter, thread and screen assumptions separately from reusable behavior. Include the pending PR changes in this map.

Evidence to move forward: Each capability has a clear behavior, lifecycle, state and dependency inventory. Existing resource-specific assumptions are visible rather than treated as permanent module ownership.

Scope boundary: The source inventory describes current code. It does not define the ownership or naming of the generalized capabilities.

### 2. Define Clima responsibilities and resource-specific inputs

Outcome: A proposed separation between reusable Clima behavior and the information that varies by document, task or surface.

Work: Include the full interaction scope: question generation, collecting partial answers, presenting results, proposing changes, reviewing them and applying accepted changes. Distinguish shared lifecycle behavior from resource schemas, permissions, revision rules and completion criteria.

Evidence to move forward: Gap collection and edit review are included as shared Clima capabilities. Chapter or gap semantics are supplied by the relevant resource context rather than hardcoded as a reason to keep the capability inside its original feature.

Scope boundary: Keep exact interface names, schema shapes, package locations and selection mechanisms open.

### 3. Generalize into reusable Clima capabilities

Outcome: Frontend components and backend operations that can be consumed without importing the original feature workspace.

Work: Remove feature-specific assumptions from result interpretation, input forms, review state and tool execution. Preserve existing behavior through resource-specific adaptation while making Clima the shared capability owner. The current document workflow becomes a consumer of these same capabilities.

Evidence to move forward: The common behavior can be exercised independently of the source feature. Required document operations and policies are explicit dependencies; they do not keep the shared forms, review components or execution lifecycle tied to that feature.

Scope boundary: This is the proposed modularization direction. It does not prescribe files, new endpoints or an implementation patch.

### 4. Prove reuse across Clima surfaces

Outcome: The same capabilities work in main Clima chat, an agentic flow or a document workspace through their relevant context.

Work: Choose concrete consumer scenarios for both frontend interactions and backend operations. Test differences in conversation state, task state, selected resources and allowed actions. Use guided collection and review as portability checks as well as simpler display tools.

Evidence to move forward: Consumers use the same Clima capability rather than copying its implementation or launching the original feature to access it. Resource-specific policies still hold in each context.

Scope boundary: The goal of reuse is committed. The exact first scenario, UI placement and integration contracts remain design decisions.

### 5. Prove implementation replacement behind the shared capability

Outcome: A compatible tool implementation can change without rewriting its consumers or related frontend components.

Work: Compare the current implementation with a controlled alternate against the same input, output, state, error and side-effect expectations. Exercise saved-state behavior, resource authorization and review/application semantics where relevant.

Evidence to move forward: Implementation changes remain localized to the capability boundary. Main chat, agentic flows and document consumers continue to use the same understood behavior. A stub proves isolation; production alternatives need separate quality and operational evaluation.

Scope boundary: Do not select a provider, runtime switching mechanism or production rollout before this evidence exists.

### 6. Expand the shared Clima capability set

Outcome: Reusable Clima tools and components with clear contracts, ownership and compatibility rules.

Work: Use the consumer and replacement evidence to refine the boundaries, choose packaging and migrate further capabilities. Track remaining feature-specific assumptions as generalization work. Keep resource-specific policies explicit while consolidating common collection, display, review and execution behavior.

Evidence to move forward: Adding a consumer or replacing a compatible implementation has a bounded change footprint. Shared capabilities no longer depend on the original feature identity to operate.

Scope boundary: A universal engine or plugin registry is not a prerequisite. The exact delivery structure follows the proven boundaries.

If a consumer or replacement probe exposes feature coupling, refine the shared Clima boundary before expanding adoption. Code movement alone is not evidence of modularity.

## Reuse and replacement criteria

### Conversational choices

Experiment: Reuse the choice capability across Clima surfaces, then replace its producer with another compatible implementation.

Must stay stable: The active session, immediate-reply semantics, answered state, history meaning and unrelated tools.

Boundary failure: Each surface must parse a feature-specific tool name or duplicate choice state to use the capability.

Question before design: What stable semantic result allows the same interaction across live, completed and stored messages?

### Static visuals

Experiment: Use the same safe visual component across surfaces and allow compatible visual-producing implementations to vary.

Must stay stable: Sanitization, restrictive CSP, script-free display, result identity and saved-message behavior.

Boundary failure: A producer change requires weakening the renderer or rewriting every surface stream handler.

Question before design: Which content and metadata belong to the shared result contract, and which stay implementation details?

### Grounded source interaction

Experiment: Reuse authorized document interaction in different surfaces and substitute a compatible evidence reader.

Must stay stable: Source authorization, artifact identity, quotation locations, coverage meaning and lifecycle restrictions.

Boundary failure: Consumers must launch the original feature, understand the reader internals or lose provenance to access evidence.

Question before design: Which resource-specific details must be supplied explicitly, and which evidence guarantees can stay common?

### Guided collection

Experiment: Reuse guided question generation and partial-answer collection across surfaces and resources, then vary a compatible generator.

Must stay stable: Validated questions, explicit target context, partial and undecided states, answer attribution and separation from document mutation.

Boundary failure: Collection still requires the original workspace, assumes every target is a concept-note chapter or treats a partial answer as completed work.

Question before design: Which target and completion semantics are inputs to reusable collection, and how do collected answers continue into a task or proposal?

### Proposal and edit review

Experiment: Reuse proposal presentation, decision collection and accepted-change handling across surfaces, while varying the producer or supported resource.

Must stay stable: Explicit acceptance, permitted actions, revision validation, retry identity and authoritative persisted outcomes.

Boundary failure: A consumer must embed the original feature to review a change, or each surface reimplements acceptance and retry logic.

Question before design: Which review behavior is common, and which change operations must the authorized target resource supply?

A controlled stub demonstrates isolation only. Real alternatives need behavioral, operational and model-quality evaluation before any claim of production interchangeability. None of these proposed checks has been run against the application as part of this website revision.

## CC-1038 and related additions

Pending PR #3350 separates read-only question generation, answer collection, scoped proposals, review and explicit revision-checked application. The full chain is in scope for generalization into Clima: generation, collection, proposal, review and accepted-change handling. Chapter, gap and document rules are resource-specific inputs to this work, not reasons to retain feature ownership of collection or review. Preserve explicit acceptance and state semantics while generalizing them. Its one-to-four questions and zero-or-two-to-five options differ from conversational choices. Accepted-answer reuse currently matches run plus quoted question text; stable chapter/gap attribution remains a concern.

Shared document storage, OCR, registration, catalog publication, readiness and authorized reading are distinct responsibilities. A shared pool does not itself establish interchangeable reading tools. Pending #3295 changes production evidence and support behavior as well as benchmarks; contract compatibility and quality evidence must be assessed separately.

- Conversational choices — CC-1020; Merged at snapshot. [#3352](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3352). At the snapshot: 2–6 options, immediate reply and saved history inside the source feature. These behaviors are inputs to Clima generalization.

- Static visuals in chat — Visual-tool implementation; Merged · gated at snapshot. [#3368](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3368). Sanitized static HTML. Tool flag is off by default; no document mutation.

- Structured gap questions — CC-1038; Open · conflicts at snapshot. [#3350](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3350). Question → answer → scoped proposal → approval. Reconcile with current chat.

- Document pool & resumable review — CC-955 / 956 / 957; Merged at snapshot. [#3359](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3359), [#3370](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3370), [#3371](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3371). Durable bytes, saved review drafts and reuse through from-document.

- Lifecycle, reconciliation & mapping — CC-958 / 990 / 992; Merged at snapshot. [#3375](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3375), [#3376](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3376), [#3377](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3377). Withdraw/supersede exists. Mapping and reconciliation are optional hooks, not active production checks for the source feature.

- HTTP ingest & GHGI cutover — CC-1218 / 1219; Merged at snapshot. [#3388](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3388). Existing start/status/confirm path. HTTP registry currently exposes GHGI/test.

- CCRA draft & Adapta Brazil — Adjacent platform work; Merged · partial at snapshot. [#3367](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3367), [#3402](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3402). CRVA plugin produces a draft but cannot commit and is not HTTP-registered. Automatic context integration was absent at the snapshot.

- CNB pool registration & retention — CC-1220 / 1221; Open · conflicts at snapshot. [#3401](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3401). Run-scoped registration and promotion API; native reading and OCR readiness synchronization remain missing.

- Chapter evidence & golden set — CC-750; Open at snapshot. [#3295](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3295). Production evidence/support changes plus a four-stage benchmark. Account for contracts before extraction.

PR statuses are dated November 6, 2026, not a live feed. Refresh relevant heads and conflicts before implementation.

## Existing code evidence

### SSE normalization

Keep tool identity and call arguments when merging result_json. Visual HTML is read from arguments; generic tool previews alone are insufficient.

[app/src/hooks/useSSEStream.ts:64–75](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/app/src/hooks/useSSEStream.ts#L64-L75) · c41bd0ba2e0d165809e376380f1d93de79822913

```typescript
function mergeToolResult(
  tool: SSEDataRecord,
  result: SSEDataRecord,
): ToolResultPayload {
  return {
    name: tool.name,
    status: tool.status,
    tool_call_id: tool.id,
    arguments: tool.arguments,
    ...result,
  };
}
```

### Live and completed dispatch

Two delivery paths reach the same onToolResult callback. Handlers must tolerate both delivery paths and deduplicate effects. Completion dispatch runs only when done.ok is true.

[app/src/hooks/useSSEStream.ts:159–182](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/app/src/hooks/useSSEStream.ts#L159-L182) · c41bd0ba2e0d165809e376380f1d93de79822913

```typescript
          case "tool_result":
            if (isRecord(event.data) && options.onToolResult) {
              options.onToolResult(event.data);
            }
            break;

          case "progress":
            options.onProgress?.(event.data);
            break;

          case "reasoning":
            options.onReasoning?.(event.data);
            break;

          case "done":
            if (
              isRecord(event.data) &&
              event.data.ok === true &&
              options.onToolResult
            ) {
              for (const toolResult of collectToolResultPayloads(event.data)) {
                options.onToolResult(toolResult);
              }
            }
```

### Draft GET authorization

The BFF resolves run city and checks access before proxying. This is an existing authorization boundary. Client-provided IDs select a resource; they do not grant access.

[app/src/app/api/v1/concept-notes/[runId]/draft/route.ts:66–87](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/app/src/app/api/v1/concept-notes/[runId]/draft/route.ts#L66-L87) · c41bd0ba2e0d165809e376380f1d93de79822913

```typescript
export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/draft`,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
```

### Run authorization

Resolve the canonical user, load the owned run, revalidate city access. Existing ownership and city checks are resource-policy constraints for generalized Clima capabilities. They do not require keeping the shared capability inside its source feature.

[climate-advisor/service/app/services/concept_note_runs.py:254–282](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/climate-advisor/service/app/services/concept_note_runs.py#L254-L282) · c41bd0ba2e0d165809e376380f1d93de79822913

```python
    async def get_authorized_run(
        self,
        *,
        run_id: UUID,
        requested_user_id: str,
        authorization: str | None,
    ) -> ConceptNoteRun:
        """Return the owned run row after revalidating current city access."""
        token = _require_bearer_token(authorization)
        canonical_user_id = await self._authorize_user(
            token=token,
            requested_user_id=requested_user_id,
        )

        # Load the owned run before revalidating its current city access.
        run = await self.repository.get_for_user(
            run_id=run_id,
            user_id=canonical_user_id,
        )
        if run is None:
            raise HTTPException(status_code=404, detail="Concept Note run not found")

        # Reject stale local access when CityCatalyst has revoked the city scope.
        await self._validate_city_access(
            token=token,
            user_id=canonical_user_id,
            city_id=UUID(run.city_id),
        )
        return run
```

### Current feature thread binding

A CNB run is bound to its current conversation. This current binding couples tools to the original feature. Generalization must remove that dependency from reusable Clima capabilities while preserving the required authorization semantics.

[climate-advisor/service/app/services/cnb/chat_readiness.py:62–71](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/climate-advisor/service/app/services/cnb/chat_readiness.py#L62-L71) · c41bd0ba2e0d165809e376380f1d93de79822913

```python
            # Authorize before exposing any readiness information.
            run = await session.get(ConceptNoteRun, run_uuid)
            if run is None:
                raise HTTPException(404, detail={"code": "concept_note_run_not_found"})
            if run.user_id != user_id:
                raise HTTPException(403, detail={"code": "concept_note_run_forbidden"})
            if run.thread_id != thread.thread_id:
                raise HTTPException(
                    409, detail={"code": "concept_note_thread_mismatch"}
                )
```

### Retry-safe acceptance

Reuse one acceptance request for a proposal, revision vector and selection. Generating a fresh idempotency key for each retry would change the existing contract. Preserve session and in-memory recovery.

[app/src/components/ConceptNoteWorkspace/use-concept-note-edits.ts:106–140](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/app/src/components/ConceptNoteWorkspace/use-concept-note-edits.ts#L106-L140) · c41bd0ba2e0d165809e376380f1d93de79822913

```typescript
  function acceptance(
    proposal: EditProposal,
    selectedIds?: string[],
  ): EditApplyRequest {
    const selection = selectedIds ? [...selectedIds].sort() : undefined;
    const cacheKey = `cnb-edit-apply:${runId}:${proposal.proposal_id}:${selection?.join(",") ?? "all"}`;
    let request = applyRequests.current.get(cacheKey);
    if (!request) {
      try {
        const stored = sessionStorage.getItem(cacheKey);
        const parsed = stored
          ? editApplyRequestSchema.safeParse(JSON.parse(stored))
          : null;
        if (
          parsed?.success &&
          revisionKey(parsed.data.expected_revisions) ===
            revisionKey(proposal.base_revisions) &&
          JSON.stringify(parsed.data.selected_change_ids ?? undefined) ===
            JSON.stringify(selection)
        )
          request = parsed.data;
      } catch {
        /* Privacy settings may disable storage; retain the in-memory retry. */
      }
    }
    request ??= {
      idempotency_key: crypto.randomUUID(),
      expected_revisions: proposal.base_revisions,
      ...(selection ? { selected_change_ids: selection } : {}),
    };
    applyRequests.current.set(cacheKey, request);
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(request));
    } catch {
      /* An authorized edit does not depend on storage availability. */
```

### Revision check and stale state

Apply validates the exact proposal revision vector and locks current chapters. The current implementation marks missing revision locks as stale and requires complete structural acceptance. Identify resource-specific rules separately from the reusable Clima review and apply lifecycle.

[climate-advisor/service/app/persistence/concept_notes/edits.py:308–343](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/climate-advisor/service/app/persistence/concept_notes/edits.py#L308-L343) · c41bd0ba2e0d165809e376380f1d93de79822913

```python
            if request.expected_revisions != proposal.base_revisions:
                raise EditOperationError(
                    "revision_vector_mismatch",
                    "Reload the proposal before accepting its exact revisions.",
                )
            if proposal.structure is not None:
                # Use the same transaction/lock as content edits, with a full snapshot check.
                from app.persistence.concept_notes.structure import save_structure

                if request.selected_change_ids is not None:
                    raise EditOperationError(
                        "invalid_selection", "Accept the complete structural proposal."
                    )
                await save_structure(
                    session,
                    run_id,
                    StructureSaveRequest(
                        expected_fingerprint=proposal.structure.before.fingerprint,
                        chapters=proposal.structure.after,
                    ),
                    proposal_id=proposal_id,
                )
                row.status = "applied"
                row.apply_key = request.idempotency_key
                row.apply_fingerprint = fingerprint
                row.updated_at = datetime.now(UTC)
                return to_response(row)
            selected = accepted_changes(proposal.changes, request.selected_change_ids)
            locked = await locked_revisions(session, run_id, proposal.base_revisions)
            if locked is None:
                row.status = "stale"
                row.error_code = "stale_base"
                row.updated_at = datetime.now(UTC)
            else:
                before: dict[str, int] = {}
                after: dict[str, int] = {}
```

### Gap-question request

Pending #3350: a strict run-scoped request body identifies chapter and gap. gap_id is optional for legacy markers. The endpoint checks the actual chapter/gap; a client reference is not enough.

[climate-advisor/service/app/models/cnb/gap_question.py:9–17](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/372d33197f49cadc5f4b31424cb9cd5905f90723/climate-advisor/service/app/models/cnb/gap_question.py#L9-L17) · 372d33197f49cadc5f4b31424cb9cd5905f90723

```python
class GapQuestionRequest(BaseModel):
    """Identify the chapter and gap; question also supports legacy inline markers."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    chapter_id: UUID
    gap_id: UUID | None = None
    question: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en", pattern=r"^[a-z]{2}(?:-[A-Za-z]{2})?$")
```

### Gap output validation

Pending #3350: one to four questions with zero or two to five distinct options. The option length bound is 80 characters. This is not the conversational choices contract, which allows two to six options.

[climate-advisor/service/app/models/cnb/gap_question.py:20–49](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/372d33197f49cadc5f4b31424cb9cd5905f90723/climate-advisor/service/app/models/cnb/gap_question.py#L20-L49) · 372d33197f49cadc5f4b31424cb9cd5905f90723

```python
class GapSubQuestion(BaseModel):
    """One part of the gap; categories are choices, never source-backed facts."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=160)
    options: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
        ]
    ] = Field(max_length=5)

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        """Allow free text or at least two distinct choices, never a lone fact."""
        if len(value) == 1 or len({option.casefold() for option in value}) != len(
            value
        ):
            raise ValueError("Use no options or two to five distinct options")
        return value


class GapQuestionOutput(BaseModel):
    """Every still-missing part of one gap, so complete answers can close it."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    why_asking: str = Field(min_length=1, max_length=240)
    questions: list[GapSubQuestion] = Field(min_length=1, max_length=4)
```

### Visual result adapter

The visual parser requires a successful typed action and call arguments. Read HTML from result.arguments.html. Saved messages follow a separate hydration path.

[app/src/components/ConceptNoteWorkspace/chat-utils.ts:98–112](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/app/src/components/ConceptNoteWorkspace/chat-utils.ts#L98-L112) · c41bd0ba2e0d165809e376380f1d93de79822913

```typescript
export function readConceptNoteToolVisual(
  result: Record<string, unknown>,
): ConceptNoteChatVisual | null {
  if (
    result.action !== "concept_note.visual.render" ||
    result.success !== true ||
    !isRecord(result.data) ||
    !isRecord(result.arguments)
  )
    return null;
  return readConceptNoteVisual({
    title: result.data.title,
    html: result.arguments.html,
  });
}
```

### Static visual sanitization

Sanitize model HTML and put the restrictive CSP first. The merged renderer allows same-origin measurement but never allow-scripts. Preserve the renderer as a complete safety boundary.

[app/src/components/ConceptNoteWorkspace/chat-visual-frame.tsx:28–53](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/app/src/components/ConceptNoteWorkspace/chat-visual-frame.tsx#L28-L53) · c41bd0ba2e0d165809e376380f1d93de79822913

```typescript
// Static HTML/SVG only. Without scripts the frame cannot navigate itself, and with
// links stripped a click cannot either, so note context cannot leave in a URL.
const VISUAL_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

// DOMPurify already drops scripts, meta, link, base, embedded frames, SVG
// <set>/<animate> and event handlers; links and forms go too.
const SANITIZE_OPTIONS = {
  WHOLE_DOCUMENT: true,
  FORBID_TAGS: ["a", "area", "form"],
  FORBID_ATTR: ["href", "xlink:href"],
};

const INLINE_DEFAULT_HEIGHT = 420;
const INLINE_MIN_HEIGHT = 120;
const INLINE_MAX_HEIGHT = 720;

/** Sanitizes model HTML and puts our CSP before any of it. */
export function buildSandboxedVisualDocument(html: string): string {
  // Fail closed where DOMPurify has no DOM (server rendering).
  if (!DOMPurify.isSupported) return "";
  const clean = DOMPurify.sanitize(html, SANITIZE_OPTIONS);
  const head = /^<html[^>]*><head>/.exec(clean)?.[0];
  if (!head) return "";
  return `<!doctype html>${head}<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}">${clean.slice(head.length)}`;
}
```

### Choice event delivery

Conversational choices have an explicit live SSE payload. The question message enters the text stream; options also arrive in a named tool_result. Generic fallback events remain distinct.

[climate-advisor/service/app/utils/streaming_events.py:264–275](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/c41bd0ba2e0d165809e376380f1d93de79822913/climate-advisor/service/app/utils/streaming_events.py#L264-L275) · c41bd0ba2e0d165809e376380f1d93de79822913

```python
        if invocation.get("name") == "concept_note_ask_question":
            question = ConceptNoteQuestion.model_validate(parsed_output)
            content = ("\n\n" if handler.assistant_tokens else "") + question.message
            handler.assistant_tokens.append(content)
            yield format_sse(
                {"index": handler.token_index, "content": content}, event="message"
            ).encode("utf-8")
            handler.token_index += 1
            yield format_sse(
                {"name": "concept_note_ask_question", **question.model_dump()},
                event="tool_result",
            ).encode("utf-8")
```

## Comparison with Stationary Energy

Stationary Energy (SE) is the second agentic flow. It tests which CNB pieces are really core. Prefixes: `ca/` = `climate-advisor/service/app/`, `cc/` = `app/src/`.

| Primitive | CNB | SE | Verdict |
|---|---|---|---|
| Run, lifecycle and status | `concept_note_runs` (`ca/models/db/concept_note.py`); idempotent start | `stationary_energy_draft_runs` (`ca/models/db/stationary_energy_draft.py`); start, status, resume, retry | Same columns, different contracts. Converge on one run envelope: identity, scope, status, step, trace and idempotency key |
| Background jobs | Separate task sets for bundle, drafting and funder import | `_schedule_background_task` in the SE draft service | Same pattern copied 4 times. One implementation can serve both |
| Scoped context loading | CA builds the bundle from CC capabilities (`ca/services/concept_note_city_context.py`) | One CC loader, `ghgi.stationary_energy.load_context` (`cc/backend/agentic/ghgi/stationary-energy/registry.ts`) | Loaders stay feature-owned. Converge on one path: load, store a snapshot, inject into the turn |
| Authorization | Identity and city only (`ca/services/concept_note_runs.py`) | CC `allowed-capabilities`: permission plus workflow step | Converge on the SE model. Share one bearer-token helper |
| Sources and evidence | Documents with sha256 and structured-artifact identity | Datasource snapshot rows | Both are an immutable snapshot plus a staleness check. Share the artifact reference; readers stay per feature |
| Proposal, review, apply | Proposal envelope with base revisions, idempotency and stale state; append-only applications | Proposals, staged selections, versioned review decisions, CC commit with `review_acceptance` | Same lifecycle. Converge on the CNB proposal envelope plus SE decision versioning; apply becomes a resource adapter |
| Streaming and progress | `concept_note_ask_question` special case; progress sink in `ca/utils/cnb_progress.py` | `ui_event` whitelist; generation progress polled | Same transport. Converge on one typed `ui_event` envelope; CNB events become entries |
| Tool binding | Hardcoded branch in `ca/services/agent_service.py`, gated by `workflow_step` and a flag | Hardcoded branch in the same file, gated by run existence | Converge on a declarative tool pack per (workflow, step), filtered by CC allowed capabilities |
| Thread binding | `bind_workflow_context` | Same function | Already shared |
| Draft persistence | CA DB plus a separate CNB DB | CA DB only | Feature-specific, except proposals and decisions |
| Prompts | `compose_prompt("cnb_chat")`, Responses API | `compose_prompt("stationary_energy_review")`, Chat Completions | Composition already shared. Pick one model API for shared tools |
| Chat UI | `ConceptNoteWorkspace/` | `StationaryEnergyDraft/` | Three chat UIs counting `ChatBot/`. Converge on `Clima/<capability>` |

What this shows:

- `review` is the strongest core candidate. The CNB proposal lifecycle is the most complete pending-action model in the repo. SE staged selections are a narrower version of it.
- `choices`, `visuals` and the progress sink are almost free of resource coupling today. Only names, the run binding and a settings flag tie them to CNB.
- `collection` matches the SE pattern "notation key with unavailable explanation". The gap model's `chapter_id` and `field_key` become resource inputs.
- `sources`: the artifact identity contract and the readers are core. The OCR side (`PdfOcrJob`) is already shared with inventory import.
- Funding reference data, drafting, validation, research, similar projects, structure and run actions such as rename and duplicate stay in CNB.

## Alignment with AgenticModuleScope

[AgenticModuleScope.md](AgenticModuleScope.md) describes this stack:

1. Module-owned capability wrappers.
2. A typed registry.
3. Scoped context loaders.
4. Chat and agent UIs that consume capabilities.
5. A shared workflow runtime.

Clima capabilities sit at items 4 and 5. Product reads and writes still go through module wrappers.

| Clima capability | Where it fits |
|---|---|
| choices | Internal CA tool plus UI. Not registered: it touches no product data |
| visuals | Internal CA tool plus UI |
| sources | Reading artifacts held by CC becomes a registered query. Today these are unregistered `internal/ca/concept-note-uploads/*` routes. Grounding and citation stay internal to CA |
| collection | Internal CA state plus UI. Writing an answer into product data is a registered command |
| review | Internal CA state plus UI. AMS keeps proposal and decision storage out of wrappers. Applying to CC data is a registered command with `review_acceptance`. A CA-owned document such as a concept note applies locally |
| runtime | Internal to CA. The workflow runtime AMS describes |
| context | Loaders are module-owned registered queries. Assembly, snapshot and injection are internal to CA |

Gaps between the two documents, and how to resolve them:

1. **Registry role.** AMS makes the registry the source of truth for tool generation; this proposal adds no registry. Resolution: the CC product registry stays the authority for product capabilities. Clima tool packs use a static (workflow, step) table, filtered by `allowed-capabilities`. No CA plugin registry.
2. **"Not a separate capability universe."** Resolution: call these "Clima interaction capabilities" in both documents. They never own product data and call module wrappers for reads and writes.
3. **Committed data.** AMS puts committed data and version history in CC, but CNB's document and undo history live in the CNB DB. Resolution: add a "CA-owned resource" category to AMS. Review takes a resource apply adapter, and version history stays with the resource owner.
4. **Two CA databases.** AMS assumes one. Resolution: document `CNB_DATABASE_URL` in AMS and place shared tables as described under database ownership.
5. **Tool exposure from loaders.** AMS says loaders must not decide tool exposure, but CNB gates tools on the bundle's `workflow_step`. Resolution: resolve the step from the run row and gate through the tool-pack table.
6. **CNB authorization.** It is not step-scoped, and CNB's CC routes are outside the registry. Resolution: add a module or workflow parameter to `allowed-capabilities` (today it returns only SE capabilities), and register document read capabilities.
7. **Progress model.** AMS specifies polling; CNB pushes SSE. Resolution: one status shape, with SSE as an optional push of that shape.
8. **Observability.** Resolution: Clima runtime owns trace metadata: workflow, run id, capability ids and outcome.
9. **First capability pack.** It covers city, GHGI and HIAP only, while stage 4 needs a consumer outside CNB. Resolution: the first reuse probes are Clima choices and visuals in main chat (CC-1234, CC-1235). They need no new product capabilities.

## Database ownership

Climate Advisor has two Postgres databases, each with its own Alembic chain under `climate-advisor/service`. Neither uses a Postgres schema, so all tables are in `public`.

- **CA DB:** `CA_DATABASE_URL`, chain `migrations/`, version table `alembic_version`.
- **CNB DB:** `CNB_DATABASE_URL`, chain `cnb_migrations/` with `cnb-alembic.ini`, version table `cnb_alembic_version`, metadata `CnbBase`. The CNB DB is provisioned outside the repo.

CNB tables in the CNB DB store `run_id` without a foreign key to `concept_note_runs` in the CA DB. The edit service locks the run in the CA DB, then writes the CNB DB in a separate transaction.

| Tables | Today | Owner after the split |
|---|---|---|
| `threads`, `messages`, `document_embeddings` | CA DB | Clima core (unchanged) |
| `stationary_energy_draft_runs`, `stationary_energy_draft_source_candidates` | CA DB | SE |
| `stationary_energy_draft_proposals`, `stationary_energy_review_decisions`, `stationary_energy_staged_review_selections` | CA DB | Later: shared `clima_proposals` and `clima_review_decisions` |
| `concept_note_runs`, `concept_note_context_bundles`, `concept_note_uploads` | CA DB | CNB. Upload identity columns are a later `clima_source_artifacts` candidate |
| `concept_note_edit_proposals` | CNB DB | Later: shared `clima_proposals` in the CA DB |
| `concept_note_edit_applications`, chapters, revisions, validations, reviews, evidence links, matched projects, exports | CNB DB | CNB (resource-owned version history) |
| `concept_note_gaps`, `concept_note_gap_resolutions` | CNB DB | CNB for now, read through the Clima collection interface. Move only after a reuse probe succeeds |
| Funding reference tables | CNB DB | CNB |
| `PdfOcrJob` and S3 artifacts | CC (Sequelize) | CC (already multi-feature) |

Rules:

- Shared Clima tables go in the CA DB, migrated by the main `migrations/` chain, with a `clima_` table prefix rather than a new schema.
- Resource-specific fields go in a JSONB payload, validated by the resource's own schema.
- Feature chains keep only feature tables.
- The `cnb` chain and its migrations stay owned by CNB. Any change to the CNB DB needs ops coordination.

## Migration plan

Each step ships separately and leaves CNB working. Steps 1–3 move no tables.

| Step | Scope | Ticket | Depends on | Tests needed | Main risk |
|---|---|---|---|---|---|
| 0 | Land or rebase pending PRs before moving the files they touch: #3350 (gap questions), #3295 (golden set), #3401 (pool registration) | CC-1038, CC-750, CC-1220/1221 | — | Their own suites | Moving files under open PRs creates conflicts |
| 1 | `Clima/stream` (merge `useChat` and `use-concept-note-chat`), `Clima/choices`, and a neutral tool name with the old name accepted when reading history. Main chat reads `tool_result` and history | CC-1234 | 0 | Existing chat-utils and CNB chat Jest tests; new ChatBot choices test; CA streaming-events test for both tool names | Saved history uses `concept_note_ask_question` |
| 2 | `Clima/visuals` and `tools/clima/visuals`, with the flag per surface | CC-1235 | 1 | Sanitizer and CSP tests; history replay in both surfaces | Weakening the sanitizer while moving it |
| 3 | Prompt layer: `prompts/clima/{choices,visuals}.md` included by `cnb/chat.md` and `chat.md`; core injection rule; delete settings path defaults; one parametrized prompt contract test | new | 1, 2 | Prompt contract test; existing prompt substring tests | A missing yaml key, hidden today by path defaults |
| 4 | `services/clima/sources` with an authorized source-resolution adapter; register a CC document read capability | CC-1236 | 0 (#3401), CC-955/957 | CC-750 golden set as the regression gate; source tool tests | The analysis contract hash changes and invalidates saved analyses |
| 5 | Runtime: declarative tool packs per (workflow, step) filtered by `allowed-capabilities`; per-surface context provider in `streaming_context.py`; typed `ui_event` envelope; `cnb_progress` to `clima/runtime` | new | 1, 2 | SE and CNB chat runtime tests; agent-service tool-binding tests | Changing which tools each surface exposes |
| 6 | Collection and review: shared proposal envelope with a resource apply adapter; `clima_proposals` and `clima_review_decisions` in the CA DB; dual-write, backfill, then switch reads | new, after a reuse probe | 4, 5 | Apply idempotency, stale-revision and retry tests for both CNB and SE; data migration dry run | Cross-DB atomicity for CNB; preserving proposal ids and `decision_version` that CC commit payloads depend on |
| 7 | Export and lifecycle | not planned | — | — | No second consumer yet |

Risks that apply to every step:

- **Unverified chat context.** CC forwards `context.concept_note_run_id` from `/api/v1/chat/messages` without its own run check, so only Climate Advisor enforces run access. This comes from the frontend inventory and is not verified. A shared Clima chat that passes resource context inherits this gap, so check it before step 1.
- **No in-place renames.** Do not rename tables in place: raw SQL hardcodes table names. Add new tables, dual-write, backfill, switch reads, then drop the old tables.
- **CNB delete path.** It must also remove Clima rows once step 6 lands.
- **i18n split.** Chat, edit, choices and visual keys move from `concept-notes` to a Clima namespace in steps 1–2.

## Decisions to defer

### Shared capability contracts

Define from the reusable behavior and the resource-specific dependencies exposed by generalization. The destination is shared Clima capabilities. Exact APIs, schemas and naming remain open.

### Tool selection and replacement

Decide after consumer and replacement probes identify the actual selection boundary. Configuration, explicit composition or a registry remain options; none is selected.

### Packaging and migration

Decide from dependency direction, ownership and the order in which consumers can adopt shared Clima behavior. Exact folders and packages follow the architecture. Existing feature names are source locations, not the target module identity.

### First consuming surfaces

Choose concrete main-chat, agentic-flow and document-workspace scenarios that exercise real reuse. Reuse across surfaces is the objective. Specific UI placement, request fields and routes are deferred.

### Resource-specific behavior

Identify what permissions, document schemas, revision policies and change operations must vary. Make these explicit capability inputs or dependencies; do not use them to keep general collection and review feature-owned.

### Replacement choice and rollout

Decide after compatibility, quality and operational evaluation. A shared Clima contract enables replacement; it does not establish equivalent model quality, cost or reliability.

## Completion criterion

Main chat, agentic flows and document workspaces reuse the same Clima capabilities, including collection and review. A compatible tool implementation can be substituted without coordinated consumer rewrites. Resource-specific policies stay enforced through explicit context and operations. Packaging and integration design follow that evidence.
