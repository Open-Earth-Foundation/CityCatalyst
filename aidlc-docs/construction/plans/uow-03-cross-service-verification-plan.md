# Verification Plan — UOW-03 Cross-Service Verification and Release Evidence

## Purpose and approval gate

This plan executes the approved UOW-03 Cross-Service Verification/Release
Evidence unit for Linear CC-737. It verifies the already committed Core and
Climate Advisor implementations at their existing service boundaries. It does
not add an authorization path, storage owner, shared runtime, deployment
topology, or production fallback.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Project**: CityCatalyst brown-field monorepo.
- **Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`.
- **Scope**: deterministic Core route/contract tests, Climate Advisor
  request-time/security regression tests, cross-service contract comparison,
  touched-file quality checks, and documented environment limitations.
- **Status**: Deterministic verification evidence captured. Final local
  revalidation at `localhost:3000` passed 4/4 after another process occupying
  the port was cleared. UOW-03 completion was explicitly approved on
  2026-08-31. No UOW-03 production implementation is planned.

## Non-negotiable verification invariants

1. Core remains the sole authority for authenticated identity, every populated
   user/organization/project/city/inventory scope, catalog lifecycle,
   allowlisting, source readiness, bounded execution, and safe errors.
2. Discovery returns only safe authorized projections, omits unauthorized,
   unavailable, withdrawn, superseded, deleted, or readiness-negative entries,
   and never exposes omission reasons or source metadata.
3. Discovery performs only lightweight readiness behavior; it does not load
   Climate Advisor capabilities or execute full reads for every entry.
4. A selected read uses the exact current catalog/capability pair and performs
   one bounded Core-mediated execution with fresh Core revalidation.
5. Stale, forged, malformed, mismatched, unauthorized, withdrawn,
   superseded, missing, deleted, and unavailable selections use the stable
   non-disclosing `404` / `capability_unavailable` contract.
6. Climate Advisor receives no S3 credentials, signed URLs, raw storage
   access, direct database access, source pointers, or unrestricted payloads.
7. Existing Climate Advisor workflow packs, feature gates, token refresh,
   timeout, cancellation, failure isolation, cleanup, and persistence remain
   compatible.

## Verification matrix

| Area | Evidence | Owner/boundary |
|---|---|---|
| Core discovery | Safe projection, scope omission, readiness-only adapter probe, feature/service/session auth | CityCatalyst Core route and capability tests |
| Core selected read | Exact mapping, scope/state/readiness revalidation, bounded result, stable unavailable error | CityCatalyst Core capability tests |
| Consumer transport | Typed routes, headers, one-time refresh, timeout normalization, safe errors | Climate Advisor client tests |
| Consumer selection/tools | Current-pair binding, selected-only registration/execution, bounded inputs/results, redaction | Climate Advisor coordinator/tool tests |
| Consumer orchestration | Request-time discovery, authenticated context handoff, additive compatibility | Climate Advisor AgentService/StreamingHandler tests |
| Security/lifecycle | Cross-context denial, forbidden-field absence, no direct storage access, cancellation/cleanup, safe telemetry | Both service suites and source inspection |
| Compatibility/release | Existing workflow regression, local auth contract, lint/format/build evidence, known limitations | Existing project commands |

## Commands

From `app/`:

```text
npm run jest -- --runInBand --coverage=false --silent \
  tests/agentic-native-input-catalog-capabilities.jest.ts \
  tests/native-input-catalog-capability-registry.jest.ts \
  tests/native-input-catalog-service.jest.ts \
  tests/native-input-catalog-source-adapters.jest.ts
```

From `climate-advisor/`:

```text
UV_CACHE_DIR=/tmp/cc737-uv-cache uv run pytest service/tests/test_agent_service.py service/tests/test_streaming_handler.py service/tests/test_native_input_catalog_tools.py service/tests/test_native_input_catalog_service.py service/tests/test_citycatalyst_client.py service/tests/test_inventory_context_tools.py -q
UV_CACHE_DIR=/tmp/cc737-uv-cache uv run pytest service/tests/test_citycatalyst_client_auth.py service/tests/test_citycatalyst_client_auth_contract.py -q
```

Quality evidence includes touched-file compile, diff, ESLint, and Prettier
checks where available. Full repository build/lint and live PostgreSQL/auth
contract outcomes are recorded as limitations when the environment prevents a
meaningful result; they are never bypassed or silently treated as green.

## Approval gates

- **Gate A — Verification evidence review**: review the completed matrix,
  contract comparison, security assertions, and limitations. Approved
  2026-08-31.
- **Gate B — UOW-03 completion**: explicitly approve the evidence before any
  release-readiness claim or task closure. Approved 2026-08-31; no broader
  release-readiness or task-closure claim is inferred.

No UOW-03 application-code change is authorized by this plan. Any discovered
contract mismatch, security regression, or new infrastructure/storage need
must stop verification and return to the owning design/unit gate.

## Current checkpoint

- Core NativeInputCatalog suites: **37/37 passed**.
- Climate Advisor UOW-02 regression suite: **109/109 passed**.
- Climate Advisor local auth tests: **5/5 passed**.
- Final requested live CC–CA contract run at `http://localhost:3000`: **4
  passed, 0 failed, 0 skipped**. The correct Core resolved
  `POST /api/v1/internal/ca/user-token`, and token, capability authorization,
  wrong-key, and cross-user assertions all passed.
- Prior failed attempt: another process was using port 3000 and caused the
  observed HTTP 404; this environment failure was resolved before the final
  run.
- Controlled aligned current-Core diagnostic at `http://localhost:3001`:
  **4 passed, 0 failed, 0 skipped** after a temporary matching `HOST`
  override. This is diagnostic evidence only and does not replace the
  requested 3000 run.
- Core touched-file ESLint: passed.
- Core touched-file Prettier check: passed.
- Climate Advisor touched-file compile and `git diff --check`: passed.
- Climate Advisor Ruff: unavailable in the environment.
- Full repository/PostgreSQL limitations remain documented in the evidence;
  they are not treated as green results.

**Initial evidence commit**: `96c089cfb` (`docs(cc-737): record UOW-03
verification evidence`). The previous revalidation update is committed as
`9767f0f08`; the environment classification is committed as `de226492f`.
The final 4/4 result is recorded in the current documentation update. UOW-03
completion was explicitly approved on 2026-08-31. No broader release-readiness
or task-closure claim is inferred from this approval.
