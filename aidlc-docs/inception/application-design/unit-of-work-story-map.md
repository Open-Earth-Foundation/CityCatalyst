# Unit of Work Story Map — CC-737

## Mapping Rules

- Every story has a primary owning unit and at least one verification responsibility.
- Cross-cutting security and compatibility behavior is implemented in the owning service unit and verified again by UOW-03.
- UOW-03 verifies behavior but does not become an authorization authority.
- Story mappings preserve the approved requirements and Linear CC-737 traceability.

## Story-to-Unit Map

| Story | Primary unit | Supporting unit(s) | Verification responsibility | Requirements / Linear concern |
|---|---|---|---|---|
| US-01 — Show only authorized native inputs | UOW-01 Core | UOW-02 | UOW-03 verifies authorized discovery, omission, and safe metadata. | FR-01, FR-02, FR-06; authorized discovery only. |
| US-02 — Understand eligible source capabilities | UOW-01 Core | UOW-02 | UOW-03 verifies allowlisted IDs and unsupported mapping behavior. | FR-02, FR-03, FR-04; exact authorized capability selection. |
| US-03 — Load only a selected source capability | UOW-02 Climate Advisor | UOW-01 | UOW-03 verifies selection binding, selected-only registration, and Core revalidation. | FR-03, FR-04, FR-08; request-time loading only. |
| US-04 — Receive bounded source-backed context | UOW-01 Core | UOW-02 | UOW-03 verifies typed bounds, forbidden fields, source ownership, and no raw storage access. | FR-05, FR-06, FR-09; bounded contract/no raw storage. |
| US-05 — Omit unauthorized or removed entries during discovery | UOW-01 Core | UOW-02 | UOW-03 verifies omission for every scope/source-state class and no metadata disclosure. | FR-01, FR-02, FR-06, FR-07; unauthorized/unavailable/removed non-disclosure. |
| US-06 — Reject stale, forged, or invalid source selections | UOW-01 Core | UOW-02 | UOW-03 verifies generic HTTP 404 `capability_unavailable`, stable envelope, and no existence/state leakage. | FR-04, FR-06, FR-07, FR-10; stale/forged/invalid read protection. |
| US-07 — Preserve existing Climate Advisor workflows | UOW-02 Climate Advisor | UOW-01 | UOW-03 runs general chat, Stationary Energy, Concept Note, inventory, legacy, auth, and token-refresh regression matrix. | FR-08, FR-10; compatibility and boundary preservation. |
| US-08 — Verify CityCatalyst Core evidence | UOW-01 Core | UOW-03 | UOW-03 consumes Core evidence and verifies integrated Core-side positive/negative behavior. | FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-09, FR-11; Core contract/security evidence. |
| US-09 — Verify Climate Advisor evidence | UOW-02 Climate Advisor | UOW-03 | UOW-03 consumes CA evidence and verifies integrated request-time/compatibility behavior. | FR-03, FR-04, FR-05, FR-07, FR-08, FR-09, FR-10, FR-11; Climate Advisor contract/security evidence. |

## Unit Coverage Summary

| Unit | Primary stories | Supporting/verification focus | Required evidence |
|---|---|---|---|
| UOW-01 Core Catalog/Capability Boundary | US-01, US-02, US-04, US-05, US-06, US-08 | Supplies Core contract and security behavior for all source reads. | Authorized/denied discovery, per-read revalidation, allowlist, bounded adapters, generic error, redaction, Core tests. |
| UOW-02 Climate Advisor Request-Time Integration | US-03, US-07, US-09 | Consumes Core contract and preserves existing agent/tool flows. | Selected-only tools, client transport, safe error/cleanup, compatibility, Climate Advisor tests. |
| UOW-03 Cross-Service Verification/Release Evidence | No exclusive product story; verifies US-01–US-09 | Integrated evidence and release readiness. | Cross-service positive/negative tests, forbidden-field checks, timeout/failure, CI/build, rollback evidence. |

## Acceptance Evidence by Concern

### Discovery and scope

- UOW-01 proves only eligible active entries are returned.
- UOW-03 probes cross-user, organization, project, city, and inventory boundaries and confirms omission without metadata.

### Selection and bounded reads

- UOW-02 proves only selected Core-issued capability IDs become request-scoped tools.
- UOW-01 proves each read revalidates current authorization, catalog state, source availability, and result bounds.
- UOW-03 proves no raw storage credentials, signed URLs, storage paths as access mechanisms, or unrestricted payloads cross the boundary.

### Stale and unavailable behavior

- UOW-01 defines/enforces generic HTTP 404 `capability_unavailable` for stale, forged, malformed, unauthorized, unavailable, missing, withdrawn, superseded, and deleted selections.
- UOW-02 preserves that contract at the tool boundary.
- UOW-03 verifies indistinguishable caller-visible behavior and safe internal telemetry.

### Compatibility and operations

- UOW-02 keeps current Climate Advisor modes and token/resource lifecycle behavior.
- UOW-03 verifies existing workflows, CI/build evidence, timeout/failure behavior, feature gating, and rollback readiness.

## Traceability Completeness

- **Stories covered**: US-01 through US-09, including the split Core evidence (US-08) and Climate Advisor evidence (US-09).
- **Linear issue**: All mappings are within CC-737; no unrelated feature or refactoring unit is introduced.
- **Security**: US-03, US-05, US-06, US-08, and US-09 have explicit unit and integrated evidence.
- **Bounded reads**: US-04, US-08, and US-09 are assigned to Core/Climate Advisor units and verified by UOW-03.
- **Core authorization**: UOW-01 is the sole authority; UOW-02 and UOW-03 consume/verify rather than replace it.
- **No storage credentials/raw access**: UOW-01 boundaries and UOW-02 wrappers enforce it; UOW-03 asserts it.

