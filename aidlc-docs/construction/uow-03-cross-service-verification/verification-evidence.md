# UOW-03 Cross-Service Verification Evidence — CC-737

**Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`  
**Status**: Deterministic evidence captured; the requested `localhost:3000`
run was blocked by an unrelated process occupying that port. The current Core
contract passes on its available port after temporary environment alignment;
UOW-03 completion review remains pending.

## Scope

This artifact records verification of the committed CityCatalyst Core and
Climate Advisor boundaries. It does not modify application behavior or create
a new cross-service runtime.

## Deterministic contract evidence

### Core — CityCatalyst

- NativeInputCatalog capability route, registry, service, and source-adapter
  suites: **37/37 passed** using the four focused Jest suites.
- Covered: safe discovery envelope, populated scope authorization, omission
  without metadata/reason, lightweight readiness without full reads, exact
  capability mapping, selected-read validation, bounded result/error behavior,
  feature gating, Climate Advisor service authentication, bearer/session user
  binding, and source adapter contracts.

### Climate Advisor

- UOW-02 request-time/client/tool regression suite: **109/109 passed**.
- Local client-auth suite: **5/5 passed**.
- Live auth-contract suite: the requested `localhost:3000` run and the
  controlled current-Core diagnostic are recorded below.
- Covered: authenticated request context, request-time discovery, selected-only
  tool registration/execution, Core-mediated bounded reads, stable errors,
  cross-context/stale/forged selection protection, finite result handling,
  redaction, token refresh, timeout/failure isolation, cancellation/cleanup,
  compatibility, and safe telemetry.

### Cross-boundary consistency

- Core and Climate Advisor use the same internal discovery/read route family,
  opaque catalog/capability pair, safe discovery projection, bounded request
  shape, and stable unavailable-selection contract.
- Core owns authorization, lifecycle, readiness, source access, and result
  shaping; Climate Advisor only orchestrates request-time selection and consumes
  the typed boundary.
- No Climate Advisor catalog storage, S3 credential, signed URL, raw storage
  call, direct database call, or source-route derivation was introduced.

## Quality checks

- Core touched-file ESLint: passed.
- Core touched-file Prettier check: passed.
- Climate Advisor touched-file Python compilation: passed.
- Climate Advisor `git diff --check`: passed.
- Climate Advisor Ruff: unavailable in the environment.

## Local environment and route resolution

- Workspace root: `/home/david/work/projects/open-earth/CityCatalyst`.
- Branch: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`.
- Expected route file is present at
  `app/src/app/api/v1/internal/ca/user-token/route.ts`.
- No stale CityCatalyst Core process was found before restart. Port 3000 was
  occupied by an unrelated Next.js process from
  `/home/david/work/projects/saas/english-for-devs`; it was not stopped.
- The current Core was started from `app/` on its available port, 3001. A
  credential-free POST probe returned HTTP 404 on port 3000 and HTTP 401 on
  port 3001 after following the route redirect, confirming route resolution
  on the current Core without exposing a service key.
- The existing `citycatalyst-db` container was started. `npm run db:migrate`
  reported that the schema was already up to date, and
  `npm run upsert-ca-smoke-fixture` completed successfully.
- `CC_SERVICE_API_KEY` and `VERIFICATION_TOKEN_SECRET` were configured. The
  `CA_SERVICE_INTEGRATION` and `STATIONARY_ENERGY_AGENTIC` flags were enabled
  through `NEXT_PUBLIC_FEATURE_FLAGS`. Values were not recorded.

## Configured local live CC–CA contract revalidation

**Date**: 2026-08-31

**Target**: `CC_BASE_URL=http://localhost:3000`
**Command**:

```text
set -a; source .env; set +a; CC_BASE_URL=http://localhost:3000 UV_CACHE_DIR=/tmp/cc737-uv-cache uv run pytest service/tests/test_citycatalyst_client_auth_contract.py -q
```

The local service key was sourced from the ignored Climate Advisor environment
without recording its value. Deterministic fixture identifiers were sourced
from that environment. No secret values or fixture values are recorded here.

**Result**: **4 failed, 0 passed, 0 skipped**.

| Test | Observed result |
|---|---|
| `test_refresh_token_against_running_cc_accepts_shared_key` | Failed: `POST /api/v1/internal/ca/user-token` returned HTTP 404. |
| `test_allowed_capabilities_against_running_cc_accepts_service_headers` | Failed during token refresh: HTTP 404 from the same endpoint. |
| `test_wrong_cc_api_key_gets_real_401_from_running_cc` | Failed: expected HTTP 401, but token refresh received HTTP 404 first. |
| `test_token_for_one_user_cannot_be_reused_for_other_user` | Failed during token refresh: HTTP 404 from the same endpoint. |

The run therefore did not reach the intended capability authorization,
wrong-key, or cross-user assertions. The observed result is that the local
Core process at `localhost:3000` did not expose the expected
`/api/v1/internal/ca/user-token` route during this run. This is a verification
failure/blocker, not an approval or a release-readiness result; UOW-03 remains
pending explicit review and approval.

## Controlled current-Core diagnostic

Using the same four tests, deterministic fixtures, and local service key with
`CC_BASE_URL=http://localhost:3001` initially produced **1 passed, 3 failed**:
the route and authorization checks were reached, but the three successful-token
paths rejected the JWT audience because the Core process inherited
`HOST=http://localhost:3000`. After restarting the current Core with the
temporary process-only override `HOST=http://localhost:3001`, the same command
completed **4 passed, 0 failed, 0 skipped**. This confirms the contract and
implementation work with the current branch and fixtures when the local host
configuration matches the serving port.

### Classification

- **Environment failure**: the mandated `localhost:3000` run hit an unrelated
  application and returned HTTP 404; the current Core could not bind to 3000.
- **Environment failure**: the first 3001 diagnostic inherited a mismatched
  `HOST` and failed JWT audience validation.
- **Implementation diagnostic**: the aligned current Core on 3001 passed all
  four contract tests, including shared-key authentication, capability
  authorization, wrong-key rejection, and cross-user token protection.
- UOW-03 is not approved, and no release-readiness or task-closure claim is
  made.

## Environment limitations

- The required contract environment variables were configured for this run.
  The requested `localhost:3000` execution remains blocked by the unrelated
  port occupant described above; the aligned current-Core diagnostic passed
  4/4.
- The pre-existing GHGI integration limitation remains: local PostgreSQL is
  not covered by this auth-contract setup and remains a separate validation
  limitation.
- Ruff is unavailable in the Climate Advisor environment.
- Full repository lint/build limitations documented in the UOW-01 evidence
  remain applicable; focused touched-file checks are the release evidence for
  this unit.

## Required review

This evidence requires explicit review and approval before a release-readiness
claim or closure of CC-737. Any failed cross-service contract, scope,
non-disclosure, boundedness, lifecycle, or storage-isolation assertion blocks
completion and returns to the owning service/unit.
