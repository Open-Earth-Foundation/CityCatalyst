# UOW-03 Cross-Service Verification Evidence — CC-737

**Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`  
**Status**: Evidence captured; UOW-03 completion review pending.

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
- Live auth-contract suite: **4 skipped** because its required contract
  environment variables are not configured.
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

## Environment limitations

- Four live auth-contract tests were skipped because the required CC/CA
  contract environment variables are not configured.
- The pre-existing GHGI integration limitation remains: local PostgreSQL is
  unavailable (`EPERM 127.0.0.1:5432`).
- Ruff is unavailable in the Climate Advisor environment.
- Full repository lint/build limitations documented in the UOW-01 evidence
  remain applicable; focused touched-file checks are the release evidence for
  this unit.

## Required review

This evidence requires explicit review and approval before a release-readiness
claim or closure of CC-737. Any failed cross-service contract, scope,
non-disclosure, boundedness, lifecycle, or storage-isolation assertion blocks
completion and returns to the owning service/unit.
