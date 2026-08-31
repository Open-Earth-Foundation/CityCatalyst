# UOW-03 Cross-Service Verification Evidence — CC-737

**Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`  
**Status**: Deterministic evidence captured; configured local live revalidation
failed at the Core token endpoint; UOW-03 completion review pending.

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
- Live auth-contract suite: the configured-local revalidation is recorded
  below; it did not reach the capability assertions because the local Core
  token endpoint returned HTTP 404.
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

## Environment limitations

- The live auth-contract suite was initially skipped because its required
  CC/CA contract environment variables were not configured. After the local
  environment was configured, the four-test revalidation ran but all four
  failed at the Core token endpoint with HTTP 404; see the revalidation table
  above.
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
