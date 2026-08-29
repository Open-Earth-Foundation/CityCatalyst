# UOW-02 Functional Design — Business Rules

These rules define the Climate Advisor consumer contract for CC-737. They
consume the approved Core rules; they do not duplicate or replace Core
authorization. Exact implementation types, route plumbing, and test locations
remain for later approved stages.

## Request identity and context

### CA-BR-01 — Active authenticated context is authoritative

Catalog discovery and selected reads use the authenticated user/session and the
already resolved active request context. Applicable organization, project,
city, and inventory context comes from the request/workflow boundary, not from
model-generated arguments or stale persisted thread state when the active
context has changed.

### CA-BR-02 — Climate Advisor cannot broaden scope

Climate Advisor may forward only the bounded context required by the approved
Core contract. It must not substitute a user, add a broader organization or
project, omit a populated scope dimension, or ask Core to infer a relationship.
Core remains responsible for resolving and authorizing every applicable
dimension.

### CA-BR-03 — Discovery follows identity resolution

The catalog path starts only after the existing request flow has resolved
identity, bearer/session state, thread correlation, and active workflow
context. No catalog discovery occurs during process startup, global agent
construction, or before the request context is available.

### CA-BR-04 — Discovery is once-per-request

For an eligible active request, Climate Advisor performs one request-time Core
discovery operation before constructing catalog-backed tools. It does not
repeatedly rediscover during tool execution unless a separately approved
contract requires a new request boundary.

## Discovery and readiness

### CA-BR-05 — Discovery is a safe projection

Climate Advisor accepts only Core's safe discovery projection. It must not
reconstruct catalog entries from raw source data, labels, IDs, storage
locations, or permission details.

### CA-BR-06 — Readiness is lightweight and non-content

Core discovery may perform a lightweight readiness/availability check for each
candidate. Climate Advisor must treat that check as eligibility metadata only.
Discovery must not load source-specific Climate Advisor capabilities, execute a
full read, retrieve source content, or iterate through all inputs with read
operations.

### CA-BR-07 — Ineligible entries remain undisclosed

Climate Advisor must not synthesize placeholders, counts, fallback labels, or
error explanations for entries omitted by Core. Unauthorized, unavailable,
withdrawn, superseded, missing, deleted, unsupported, and uncertain entries
remain indistinguishable from absent entries at the consumer boundary.

### CA-BR-08 — Empty or unavailable discovery degrades safely

If the Core feature is disabled, discovery is unavailable, the response is
empty, or the response cannot be safely validated, Climate Advisor registers
no catalog-backed tools. Existing general, inventory, Stationary Energy,
Concept Note, legacy, and vector behavior remains governed by its current
rules. No raw-storage or unrestricted datasource fallback is permitted.

### CA-BR-09 — Discovery response is bounded and typed

The consumer accepts only the approved discovery envelope, safe entry fields,
Core-issued capability identifiers, and bounded list/field sizes. Unexpected
fields may be ignored only where existing parsing conventions make that safe;
malformed required data fails closed without exposing the upstream body.

## Selection and tool registration

### CA-BR-10 — Selection comes from the current discovery response

Climate Advisor can construct a selected tool only when the requested catalog
identity and Core-issued capability identity are present as a matching pair in
the current authorized discovery response. A persisted, model-provided, or
manually fabricated pair is not sufficient.

### CA-BR-11 — Core-issued capability IDs are opaque

Climate Advisor treats capability IDs as opaque values. It never derives a
route, module, source, operation, or capability ID from `kind`, `source_type`,
labels, source IDs, arbitrary names, or model output.

### CA-BR-12 — Selected-only registration

The request-scoped factory registers only the selected eligible entries and
their allowlisted capability operations. It does not register all discovery
entries, all registry capabilities, or a generic tool with arbitrary source
arguments.

### CA-BR-13 — Selection does not grant access

Consumer-side membership in the current discovery result is necessary for tool
construction but is not authorization. Every invocation remains subject to
Core's current user, scope, catalog, mapping, source, and bounded-read checks.

### CA-BR-14 — Tool inputs are capability-specific

Each selected tool exposes only the input fields declared by the selected Core
capability. Bounds, types, required values, and finite collection sizes are
validated before the client call. Tool input cannot include raw storage
arguments, credentials, signed URLs, route names, source pointers, or
replacement scope identities.

### CA-BR-15 — Request context is bound, not model-selected

Required user and resource context is captured from the active request and
passed to Core through the approved contract. If required context is missing,
inconsistent, or does not match the selected entry, the tool fails closed
without attempting a broadened read.

## Core client and selected reads

### CA-BR-16 — Endpoint details stay in the client boundary

Only the narrow typed `CityCatalystClient` methods own Core discovery/read
transport details. Tools and orchestration do not construct source-specific
URLs, call module endpoints directly, or use generic HTTP helpers to bypass the
client's authentication, timeout, refresh, and error conventions.

### CA-BR-17 — Bearer and service authentication use existing conventions

Core calls propagate the existing user-scoped bearer and Climate Advisor
service headers through the current client conventions. Service credentials
remain runtime-only and are never exposed to tools, model prompts, tool
results, telemetry, or persisted selection data.

### CA-BR-18 — One selected capability is executed

After a tool invocation, Climate Advisor makes at most the selected bounded
read required by that tool call. It does not execute discovery candidates in
bulk, call all selected tools speculatively, or turn readiness checks into
source reads. Any retry is limited to the existing one-time authentication
refresh convention and never changes the selected capability.

### CA-BR-19 — Core revalidation remains authoritative

Climate Advisor does not cache or assert authorization based on discovery. It
forwards the exact selection and typed bounded input so Core can revalidate the
caller, all populated scope dimensions, current catalog lifecycle, exact
capability mapping, source availability, and result bounds immediately before
execution.

### CA-BR-20 — Successful results are bounded again at the tool boundary

Climate Advisor accepts only the Core-declared bounded result shape and passes
the minimum typed content needed by the agent. It rejects or safely normalizes
malformed/oversized responses and never forwards raw upstream JSON, storage
objects, database rows, signed URLs, credentials, storage paths as access
mechanisms, or unrestricted source payloads.

## Error and non-disclosure behavior

### CA-BR-21 — Stable selected-resolution error is preserved

The approved Core selection-resolution response is HTTP `404` with code
`capability_unavailable` and message `Requested capability is unavailable.`
Climate Advisor maps this to the existing safe tool-error shape without adding
source, catalog, scope, state, or upstream details. The exact framework
serialization remains an implementation concern of the approved design/code
stages; the consumer must not create a competing contract.

### CA-BR-22 — All invalid selections are non-disclosing

Stale, forged, malformed, unknown, mismatched, unauthorized, withdrawn,
superseded, missing, deleted, unavailable, and unreadable selections must not
be distinguishable through tool output, model-visible error text, or response
metadata. No automatic replacement selection is allowed.

### CA-BR-23 — Upstream error bodies are never passed through

Core response bodies, exception text, storage details, source IDs, permission
reasons, and dependency messages are internal. Climate Advisor may classify an
error for safe telemetry, but user/model-visible output uses the approved safe
shape and existing generic transport error conventions.

### CA-BR-24 — Failure isolation is bounded

A failed selected tool does not authorize another source, expose the failed
source, trigger a raw-storage fallback, or disable unrelated tools by
implication. The agent may continue with independently available existing tools
only according to the existing orchestration contract.

## Workflows, tokens, resources, and telemetry

### CA-BR-25 — Existing workflow packs retain precedence

Catalog-driven tools are additive and mode-aware. General chat, inventory,
Stationary Energy review/start-draft, Concept Note, legacy datasource, and
vector tools retain their existing registration conditions and boundaries.
Catalog tools must not replace or silently widen those packs.

### CA-BR-26 — Token refresh remains one-time and user-scoped

Catalog-backed calls reuse the existing mutable request token reference and
one-time refresh behavior. A refreshed token may update the request's token
reference and follow the existing persistence path. Refresh errors are safe,
bounded, and never expose token values.

### CA-BR-27 — Resource lifetime is request/tool bounded

HTTP clients, responses, streams, and other per-request/per-tool resources are
closed on successful completion, validation failure, timeout, cancellation,
Core failure, and token-refresh failure. Selection state must not retain a
client, connection, token, or source handle after request cleanup.

### CA-BR-28 — Telemetry is safe and low-cardinality

Consumer telemetry may include a correlation reference, safe caller reference,
approved catalog/capability identity where permitted, coarse outcome, and
bounded duration. It must exclude bearer/service tokens, credentials, raw
source content, storage details, signed URLs, unnecessary scope identifiers,
and upstream exception bodies. A telemetry record must not become an existence
oracle.

### CA-BR-29 — Core unavailability does not change ownership

When Core is unavailable or times out, Climate Advisor omits catalog-backed
tools for that request or returns the approved safe tool outcome. It does not
query NativeInputCatalog storage, module storage, S3, or a new parallel
authorization service.

## Verification rules

### CA-BR-30 — Critical security behavior is example-tested

Climate Advisor evidence must cover authorized discovery/selection, each
populated scope class through Core contract fixtures, stale/forged/malformed
selection, unavailable/deleted behavior, stable errors, bounded results,
forbidden-field absence, and service/bearer failures.

### CA-BR-31 — Selected-only and readiness separation is tested

Tests must prove that discovery invokes only lightweight readiness semantics,
does not load or execute source tools, and that a selected invocation loads and
executes only its own capability. A second unselected entry must remain
unloaded and unread.

### CA-BR-32 — Compatibility and cleanup are tested

Existing workflow modes, feature/auth boundaries, token refresh, timeout,
cancellation, failure isolation, client closure, and token persistence
behavior must retain regression evidence. Partial property-based tests may
cover pure selection, projection, input/output bounds, and safe-error
invariants with reproducible seeds; they do not replace critical examples.

## Traceability

| Rule group | Requirements / NFRs | Stories | Linear CC-737 concern |
|---|---|---|---|
| CA-BR-01–09 | FR-01, FR-02, FR-04, FR-06, FR-07, NFR-01, NFR-03, NFR-06 | US-03, US-07, US-09 | Authorized request-time discovery with no metadata disclosure. |
| CA-BR-10–15 | FR-03, FR-04, FR-08, NFR-05, NFR-07 | US-03, US-09 | Exact current selection and selected-only tool surface. |
| CA-BR-16–20 | FR-05, FR-06, FR-09, FR-10, NFR-01, NFR-02, NFR-03 | US-03, US-09 | Core-mediated bounded reads with no raw storage access. |
| CA-BR-21–24 | FR-04, FR-06, FR-07, FR-10, NFR-01, NFR-04, NFR-06 | US-03, US-09 | Stable stale/forged/unavailable non-disclosure and isolation. |
| CA-BR-25–29 | FR-08, FR-09, FR-10, NFR-04, NFR-05, NFR-06 | US-07, US-09 | Existing workflow, token, timeout, cleanup, and ownership preservation. |
| CA-BR-30–32 | FR-11, NFR-08 | US-09 | Climate Advisor contract, security, compatibility, and lifecycle evidence. |

## Rule precedence

1. Existing authentication and active request identity rules.
2. Core authorization, catalog lifecycle, exact capability mapping, and
   bounded-read contract.
3. Consumer selected-only registration and workflow compatibility.
4. Safe errors, cleanup, telemetry, and graceful degradation.

Compatibility or convenience behavior must not override Core authorization,
non-disclosure, bounded-read, source-ownership, or storage-isolation rules.
