# Personas — CC-737

These personas describe the people and system roles affected by connecting NativeInputCatalog to Climate Advisor capabilities. They are intentionally product-facing; exact classes, routes, and deployment units are deferred to Application Design and Units Generation.

P-01 is the only end-user persona. P-02, P-03, and P-04 represent important system, technical ownership, and governance responsibilities; they are not end users and must not be treated as end-user personas.

## P-01 — City Climate User

- **Role type**: End-user persona.
- **Archetype**: City analyst, sustainability lead, or other authorized workspace user.
- **Goal**: Ask Climate Advisor for useful, source-backed climate context from inputs already available in the user's CityCatalyst workspace.
- **Motivation**: Avoid manually searching across modules while retaining confidence that the assistant is using the correct city, project, organization, and inventory context.
- **Permissions**: Can use only the CityCatalyst resources granted to the authenticated user in the active request context.
- **Needs**: Clear usable source choices, bounded answers, understandable generic handling when a source is unavailable, and no exposure of other users' data.
- **Success**: Receives accurate assistance from authorized sources without seeing internal identifiers, storage details, or unauthorized-source existence.
- **Mapped stories**: US-01, US-03, US-04, US-05, US-06, US-07.

## P-02 — Climate Advisor Orchestrator

- **Role type**: System role, not an end user.
- **Archetype**: The Climate Advisor service acting on behalf of P-01.
- **Goal**: Discover eligible source capabilities and load only the tools needed for the active request.
- **Motivation**: Provide relevant, bounded context while reducing accidental tool exposure and preserving workflow-specific behavior.
- **Permissions**: Uses service authentication plus the user's scoped bearer token; it is not an independent authority to grant access.
- **Needs**: Stable discovery metadata, allowlisted capability selection, per-read validation, bounded contracts, safe errors, and token/resource cleanup.
- **Success**: Registers and invokes only authorized, selected capabilities and can continue safely when one source is unavailable.
- **Mapped stories**: US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-09.

## P-03 — CityCatalyst Core and Module Owner

- **Role type**: Technical ownership and maintenance role, not an end user.
- **Archetype**: Maintainer responsible for Core authorization, NativeInputCatalog, and GHGI/HIAP/CNB source systems of record.
- **Goal**: Make durable native inputs discoverable without moving ownership or weakening module boundaries.
- **Motivation**: Enable reuse across CityCatalyst while keeping authorization and storage access centralized and auditable.
- **Permissions**: Owns Core catalog and capability boundaries; module owners control their source-of-truth data.
- **Needs**: Explicit contracts, scope validation, source-state validation, bounded responses, compatibility, and diagnosable safe telemetry.
- **Success**: Every returned or read source is authorized and current, while source content and storage remain behind the owning boundary.
- **Mapped stories**: US-01, US-02, US-03, US-04, US-06, US-07, US-08.

## P-04 — Security and Operations Reviewer

- **Role type**: Security and operational governance role, not an end user.
- **Archetype**: Reviewer responsible for privacy, security, reliability, deployment safety, and operational support.
- **Goal**: Verify that catalog-driven assistance cannot become a cross-scope disclosure or uncontrolled storage-access path.
- **Motivation**: Protect city data and ensure the change can be operated through existing CityCatalyst processes.
- **Permissions**: Reviews evidence, contracts, telemetry, CI results, and operational scenarios; does not receive source secrets as part of review.
- **Needs**: Positive and negative security tests, safe audit signals, explicit inherited operational processes, bounded failure behavior, and reproducible verification.
- **Success**: Security and operational acceptance criteria are testable, reviewable, and compatible with existing processes.
- **Mapped stories**: US-03, US-04, US-05, US-06, US-07, US-08, US-09.

## Persona Interaction Summary

| Persona | Role classification | Primary need | Trust boundary |
|---|---|---|---|
| P-01 City Climate User | End user | Use authorized native inputs through Climate Advisor | User identity and workspace permissions |
| P-02 Climate Advisor Orchestrator | System role; not an end user | Select and invoke bounded capabilities | Service identity plus user bearer token; no access-grant authority |
| P-03 Core/Module Owner | Technical ownership/maintenance; not an end user | Enforce ownership, scope, source state, and bounded contracts | CityCatalyst Core and module capability boundaries |
| P-04 Security/Operations Reviewer | Security/operational governance; not an end user | Validate non-disclosure, reliability, and operability | Audit/test evidence and existing operational controls |
