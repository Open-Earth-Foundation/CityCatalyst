# Task 5 Report: Validate Core identity and disable catalog refresh from claimed user IDs

## Outcome

Task 5 closes the request-identity escalation path introduced by runtime
NativeInputCatalog discovery **for request-supplied bearers and for every
NativeInputCatalog path**. It does not close the end-to-end claimed-identity
escalation for Climate Advisor as a whole: `POST /v1/threads` is still
unauthenticated, and legacy non-catalog inventory tools may still refresh a
token from the request body `user_id`. See the whole-branch fix section at the
end of this report.

- `/v1/messages` now validates every supplied or thread-loaded CityCatalyst
  bearer through Core's existing
  `/api/v1/internal/ca/auth/identity` boundary before persisting the message or
  constructing the streaming handler.
- Core's canonical user ID must exactly match `payload.user_id`. Invalid tokens
  and subject mismatches receive the same stable HTTP 401 response:
  `CityCatalyst authentication failed`.
- `StreamingHandler` receives the validated catalog identity separately from
  the body-owned chat identity. A token without a validated catalog identity
  cannot create NativeInputCatalog context or tools.
- The shared internal Core POST path now has an explicit
  `allow_token_refresh` switch. It defaults to `True` for compatibility, while
  NativeInputCatalog discovery and read set it to `False`.
- NativeInputCatalog wrappers discard their `user_id` refresh argument and do
  not allow the shared client to derive a refresh identity from request JSON.
- Core authorization, storage ownership, and unrelated Climate Advisor token
  refresh behavior were not changed.

Implementation commit:

- `ba2531ccf` — `fix(cc-737): validate catalog identity boundary`

No branch was pushed.

## Root-cause evidence

Before Task 5, the trust chain was unsafe in three connected places:

1. `climate-advisor/service/app/routes/messages.py` accepted `payload.user_id`
   as the user identity, accepted `access_token` / `cc_access_token` from
   request JSON (or loaded it from thread context), and constructed
   `StreamingHandler` without validating the bearer against Core.
2. `StreamingHandler._native_input_catalog_request()` enabled catalog context
   whenever `cc_access_token` was present and populated
   `ActiveRequestContext.user_id` from `self.user_id`, which came from the
   request body.
3. `CityCatalystClient.discover_native_inputs()` and
   `read_native_input()` passed that claimed `user_id` as
   `refresh_user_id`. On a 401, `post_internal_capability()` could call
   `/api/v1/internal/ca/user-token`, and the shared fallback could also derive a
   refresh user from `json_data.userId` / `json_data.user_id`.

Runtime discovery made this materially dangerous: an invalid bearer combined
with an attacker-selected body user could reach a catalog call, receive a 401,
then ask the service-authenticated refresh endpoint for a token scoped to the
claimed user.

The repository already contained
`CityCatalystClient.validate_user_identity()`, originally added for another
workflow. It already posts the current bearer plus `X-Service-Name` and
`X-Service-Key` to the Core identity boundary without a user ID or refresh
request. Task 5 reused that established boundary instead of adding a parallel
identity mechanism.

## TDD evidence

### RED

Tests were changed first, before production implementation. The focused RED
command collected seven checks:

```bash
UV_CACHE_DIR=/tmp/cc737-task5-uv-cache \
uv run --directory service pytest \
  tests/test_api_routes.py::MessageIdentityGateTests \
  tests/test_citycatalyst_client_auth.py::CityCatalystClientAuthTests::test_validate_user_identity_uses_bearer_and_service_headers \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_discover_native_inputs_does_not_refresh_from_claimed_user_on_401 \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_read_native_input_does_not_refresh_from_claimed_user_on_401 \
  tests/test_streaming_handler.py::StreamingHandlerCompletionTests::test_native_input_catalog_context_uses_authenticated_request_identity \
  tests/test_streaming_handler.py::StreamingHandlerCompletionTests::test_native_input_catalog_context_requires_validated_core_identity \
  -q
```

Result: **6 failed, 1 passed**.

The six expected failures proved the missing controls:

- invalid bearer did not raise HTTP 401;
- canonical subject mismatch did not raise HTTP 401;
- catalog discovery refreshed and succeeded after a 401;
- catalog read refreshed and succeeded after a 401;
- handler catalog context used the body-owned identity instead of the
  canonical identity;
- a bearer without a validated identity still enabled catalog context.

The one passing check was the identity-validation request-shape test. This was
expected after investigation because the identity client call predated Task 5;
the missing behavior was route adoption and catalog gating, not the HTTP shape
inside that existing method.

### GREEN

After the minimal production change, the focused security command collected
the original seven checks plus the validated route-to-handler handoff check:

```text
collected 8 items
tests/test_api_routes.py ...
tests/test_citycatalyst_client_auth.py .
tests/test_citycatalyst_client.py ..
tests/test_streaming_handler.py ..
8 passed, 6 warnings in 2.12s
```

## Verification evidence

### Expanded focused regression

Command:

```bash
TIKTOKEN_CACHE_DIR=/tmp/cc737-tiktoken-cache \
UV_CACHE_DIR=/tmp/cc737-task5-uv-cache \
uv run --directory service pytest \
  tests/test_native_input_catalog_service.py \
  tests/test_native_input_catalog_tools.py \
  tests/test_agent_service.py \
  tests/test_streaming_handler.py \
  tests/test_citycatalyst_client.py \
  tests/test_citycatalyst_client_auth.py \
  tests/test_api_routes.py::MessageIdentityGateTests \
  -q
```

Result: **121 passed, 6 warnings in 2.79s**.

This covers fresh discovery, bounded read tools, agent tool composition,
validated handler context, the shared Core client, identity request shape, and
the route identity gate.

### Legacy non-catalog refresh preservation

Command:

```bash
TIKTOKEN_CACHE_DIR=/tmp/cc737-tiktoken-cache \
UV_CACHE_DIR=/tmp/cc737-task5-uv-cache \
uv run --directory service pytest \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_inventory_capability_retries_with_refreshed_token_on_401 \
  -q
```

Result: **1 passed in 0.40s**.

This proves the new switch remains default-on for the existing non-catalog
internal capability path.

### Compile and diff checks

Commands:

```bash
UV_CACHE_DIR=/tmp/cc737-task5-uv-cache \
uv run --directory service python -m compileall app

git diff --check
git diff --cached --check
```

Results: all commands exited 0. Python compilation traversed the full
`climate-advisor/service/app` package. Both unstaged and staged diff checks
reported no whitespace errors.

## Files changed

Production:

- `climate-advisor/service/app/routes/messages.py`
  - validates the current bearer with Core;
  - rejects invalid/mismatched identity before message persistence and handler
    creation;
  - passes the canonical catalog identity separately.
- `climate-advisor/service/app/services/citycatalyst_client.py`
  - adds the explicit default-on `allow_token_refresh` control;
  - disables it for NativeInputCatalog discovery/read;
  - prevents those calls from deriving or using a refresh user identity.
- `climate-advisor/service/app/utils/streaming_handler.py`
  - requires both a current bearer and canonical validated catalog identity;
  - uses only the canonical identity in `ActiveRequestContext`.

Tests:

- `climate-advisor/service/tests/test_api_routes.py`
- `climate-advisor/service/tests/test_citycatalyst_client.py`
- `climate-advisor/service/tests/test_citycatalyst_client_auth.py`
- `climate-advisor/service/tests/test_streaming_handler.py`

Documentation:

- `climate-advisor/README.md`
- `climate-advisor/docs/architecture.md`

## Mandatory post-change skill results

### simplify-after-change

- Kept the change on the existing client and handler seams; no new service,
  adapter, dependency, or authorization layer was introduced.
- Made refresh identity derivation occur only inside the explicit
  `allow_token_refresh` branch.
- Discarded NativeInputCatalog refresh parameters at their wrapper boundary.
- Removed extra canned retry responses from the no-refresh tests after GREEN.

### docs-after-change

- Updated the README message contract and NativeInputCatalog section with the
  identity validation, stable mismatch failure, unauthenticated catalog gate,
  and catalog-only no-refresh rule.
- Updated the architecture request flow and NativeInputCatalog trust boundary.
- Reviewed setup/environment documentation; no environment variable, command,
  storage, or deployment change required additional edits.

## Concerns and limitations

- The first untouched broad `test_api_routes.py` baseline attempt stalled in
  the existing database-backed route setup before producing a test result and
  was interrupted. Task 5 route tests were therefore isolated in the
  dependency-free `MessageIdentityGateTests` class and pass as part of the
  121-test focused regression.
- An initial 54-test focused run produced **52 passed, 2 failed** because two
  unrelated prompt-budget tests attempted to download the `o200k_base`
  tokenizer from a network-blocked host. Reusing the existing local tokenizer
  cache made the same focused set pass **54/54**; the final expanded run used
  that cache and passed 121/121.
- The six pytest warnings are pre-existing suite warnings; Task 5 introduced no
  warning-based bypass or suppression.
- No full Climate Advisor suite, live Core contract, deployment, or push was
  run. The requested focused security/client/handler evidence, compilation,
  and diff checks are complete.

---

# Task 5 fix: identity-gate over-rejection (review findings I-1 and I-2)

**Brief:** `task-5-fix-brief.md`
**Branch:** `cc-737-runtime-discovery` (no push)
**HEAD before fix:** `a961a182e`
**Fix commit:** `732a79773` — `fix(cc-737): keep chat open when catalog identity is unavailable`

## Findings closed

- **I-1** — `/v1/messages` mapped every `CityCatalystClientError` to HTTP 401,
  so a Core outage, an unset `CC_BASE_URL`, a transport failure, or a malformed
  identity response 401'd plain chat.
- **I-2** — a thread-stored bearer that Core rejects 401'd the whole chat
  request, making the preserved legacy `post_internal_capability` 401→refresh
  path unreachable in the expired-token case.
- **M-4** (folded in) — README and architecture docs re-synced to the amended
  behavior.

## Policy implemented

`climate-advisor/service/app/routes/messages.py` (identity gate only):

1. Bearer present → `CityCatalystClient.validate_user_identity(token)` with no
   user-ID refresh (unchanged).
2. Success and canonical subject `!= payload.user_id` → HTTP 401 with the
   stable `CityCatalyst authentication failed` detail; `StreamingHandler` is
   never constructed. Applies to payload and thread tokens alike.
3. `CityCatalystClientError` with `status_code` in `{401, 403}` **and** the
   token came from the request payload → HTTP 401, handler not constructed.
4. `CityCatalystClientError` with `status_code` in `{401, 403}` **and** the
   token came from thread storage → `catalog_user_id = None`, request continues.
5. Any other identity error (503, missing `CC_BASE_URL`, transport, malformed
   response) → `catalog_user_id = None`, request continues. No 401.
6. No bearer → unchanged.

No token is minted or refreshed from `payload.user_id` in this path, and no
thread-token refresh was added at the route (`TokenHandler` is still
constructed with the body-supplied `user_id`).

## TDD evidence

### RED

New tests added to `tests/test_api_routes.py::MessageIdentityGateTests`:

- `test_message_continues_without_catalog_when_core_is_unavailable`
- `test_message_continues_without_catalog_when_thread_token_is_rejected`

```bash
cd climate-advisor
uv run --directory service pytest tests/test_api_routes.py::MessageIdentityGateTests -q
```

```text
tests/test_api_routes.py FF...                                           [100%]
...
app/routes/messages.py:142: in post_message
    raise HTTPException(
E   fastapi.exceptions.HTTPException: 401: CityCatalyst authentication failed
...
FAILED tests/test_api_routes.py::MessageIdentityGateTests::test_message_continues_without_catalog_when_core_is_unavailable
FAILED tests/test_api_routes.py::MessageIdentityGateTests::test_message_continues_without_catalog_when_thread_token_is_rejected
=================== 2 failed, 3 passed, 6 warnings in 2.30s ====================
```

Both failed for the intended reason (the old blanket 401), and the three
pre-existing gate tests stayed green throughout.

### GREEN

```bash
cd climate-advisor
uv run --directory service pytest tests/test_api_routes.py::MessageIdentityGateTests -q
```

```text
collected 5 items

tests/test_api_routes.py .....                                           [100%]

======================== 5 passed, 6 warnings in 1.96s =========================
```

### Full covering command from the fix brief (run after the docs pass)

```bash
cd climate-advisor
uv run --directory service pytest \
  tests/test_api_routes.py::MessageIdentityGateTests \
  tests/test_citycatalyst_client_auth.py::CityCatalystClientAuthTests::test_validate_user_identity_uses_bearer_and_service_headers \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_discover_native_inputs_does_not_refresh_from_claimed_user_on_401 \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_read_native_input_does_not_refresh_from_claimed_user_on_401 \
  tests/test_streaming_handler.py::StreamingHandlerCompletionTests::test_native_input_catalog_context_uses_authenticated_request_identity \
  tests/test_streaming_handler.py::StreamingHandlerCompletionTests::test_native_input_catalog_context_requires_validated_core_identity \
  -q
```

```text
collected 10 items

tests/test_api_routes.py .....                                           [ 50%]
tests/test_citycatalyst_client_auth.py .                                 [ 60%]
tests/test_citycatalyst_client.py ..                                     [ 80%]
tests/test_streaming_handler.py ..                                       [100%]

======================== 10 passed, 6 warnings in 2.18s ========================
```

10/10 passing. The security contract from the original Task 5 still holds: the
invalid **payload** token case is still 401, subject mismatch is still 401, and
the catalog no-refresh client/handler tests are unchanged and green.

## Files changed

- `climate-advisor/service/app/routes/messages.py`
- `climate-advisor/service/tests/test_api_routes.py`
- `climate-advisor/README.md`
- `climate-advisor/docs/architecture.md`

## Mandatory post-change skill results (fix pass)

### simplify-after-change

- Kept the change inside the existing gate block; no new helper, wrapper, or
  branch-dispatch abstraction was added.
- Expressed the auth-rejection statuses as one module constant
  (`_CC_AUTH_REJECTION_STATUSES`) instead of repeating literals.
- Used `try/except/else` so the success-only subject check is not reachable
  from the error path, avoiding a sentinel flag variable.
- Kept the explicit `catalog_user_id = None` reset in the error path as a
  fail-closed guard, so no partially validated identity can survive.
- Added one shared test helper (`_stub_session_factory`) rather than repeating
  async session-mock scaffolding; no unused imports or dead code remain.

### docs-after-change

- `climate-advisor/README.md` message-contract section: 401 is now documented
  as subject mismatch or a rejected **request-supplied** bearer; Core
  unavailability and a rejected thread-stored bearer keep the chat request
  succeeding with NativeInputCatalog disabled.
- `climate-advisor/docs/architecture.md` request-flow diagram: the identity
  `alt` now has an explicit "continue with catalog identity disabled" branch,
  which also resolves review M-4 (the diagram no longer implies an expired
  thread token hard-fails before the refresh branch).
- `climate-advisor/docs/architecture.md` trust-boundary paragraph: states the
  exact set of outcomes that 401 versus degrade.
- Reviewed environment, setup, and deployment docs: no env var, command, or
  output contract changed, so no edit was required there.

## Concerns and limitations

- Review ⚠️ 1 (identity format parity between Core's canonical `user_id` and
  the client-sent `payload.user_id`) is unchanged and still a Core-side
  contract question. It is now less dangerous — a format skew produces 401 only
  when Core actually returns a subject, which is the mismatch case — but a
  systematic representation difference would still 401 every bearer-carrying
  request. Out of scope for this fix brief.
- The broad DB-backed `test_api_routes.py` suite was still not run (review
  ⚠️ 4); the new tests remain in the dependency-free `MessageIdentityGateTests`
  class. The new thread-token test stubs `ThreadService`/`MessageService` and
  the session factory, so it does not exercise real persistence.
- Out-of-scope minors M-1 (keyword-only `StreamingHandler` signature), M-2
  (unused `user_id` catalog parameters), and M-5 (pytest warning hygiene) were
  deliberately not addressed, per the fix brief.
- No push, no PR, no Core change, and the parent checkout was not touched.

---

# Whole-branch fix: unvalidated bearer persistence (review findings I-1, I-2, I-3)

**Brief:** `whole-branch-fix-brief.md`
**Review:** `whole-branch-review.md`
**Branch:** `cc-737-runtime-discovery` (no push)
**HEAD before fix:** `8bbb817e5`

## Controller rulings applied

- **I-2 — fixed in code.** `/v1/messages` no longer persists
  `token_from_payload` into thread context unless Core identity validation
  succeeded (`catalog_user_id is not None`). A Core outage can no longer
  launder a request-supplied bearer into the lenient thread-token class. The
  user message itself is persisted exactly as before; only the `access_token`
  context write is gated.
- **I-3 — documented, no refresh added.** Refreshing the thread bearer from the
  thread record's stored `user_id` was rejected: `POST /v1/threads` is
  unauthenticated and accepts an arbitrary `user_id`, so that identity is not
  server-validated and refreshing from it would reopen the claimed-identity
  attack. Catalog recovery is a new request-supplied bearer that passes Core
  identity validation; until then catalog tools stay unregistered and chat
  continues.
- **I-1 — documented, no auth expansion.** Every "escalation closed" claim is
  now qualified to "closed for request-supplied bearers / NativeInputCatalog
  paths". `POST /v1/threads` remains unauthenticated and legacy non-catalog
  tools may still refresh from the request body `user_id`.

## TDD evidence

### RED

New test in `tests/test_api_routes.py::MessageIdentityGateTests`:
`test_message_does_not_persist_payload_token_when_identity_is_unvalidated` —
payload `access_token` + identity `status_code=503` + stub session factory and
`ThreadService`.

```bash
cd climate-advisor
uv run --directory service pytest tests/test_api_routes.py::MessageIdentityGateTests -q
```

```text
tests/test_api_routes.py ..F...                                          [100%]
tests/test_api_routes.py:344: in test_message_does_not_persist_payload_token_when_identity_is_unvalidated
    self.assertNotIn("access_token", persisted_keys)
E   AssertionError: 'access_token' unexpectedly found in ['access_token']
=================== 1 failed, 5 passed, 6 warnings in 2.05s ====================
```

Failed for the intended reason: the degrade path wrote the unvalidated bearer
to thread context. The five pre-existing gate tests stayed green.

### GREEN

```text
collected 6 items
tests/test_api_routes.py ......                                          [100%]
======================== 6 passed, 6 warnings in 1.94s =========================
```

## Verification evidence

Covering command from the brief:

```bash
cd climate-advisor
uv run --directory service pytest \
  tests/test_api_routes.py::MessageIdentityGateTests \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_discover_native_inputs_does_not_refresh_from_claimed_user_on_401 \
  tests/test_citycatalyst_client.py::CityCatalystClientTests::test_read_native_input_does_not_refresh_from_claimed_user_on_401 \
  tests/test_streaming_handler.py::StreamingHandlerCompletionTests::test_native_input_catalog_context_uses_authenticated_request_identity \
  tests/test_streaming_handler.py::StreamingHandlerCompletionTests::test_native_input_catalog_context_requires_validated_core_identity \
  -q
```

```text
collected 10 items
tests/test_api_routes.py ......                                          [ 60%]
tests/test_citycatalyst_client.py ..                                     [ 80%]
tests/test_streaming_handler.py ..                                       [100%]
======================== 10 passed, 6 warnings in 1.92s ========================
```

Broader regression (the same set the whole-branch review re-ran):

```text
tests/test_native_input_catalog_service.py, tests/test_native_input_catalog_tools.py,
tests/test_agent_service.py, tests/test_streaming_handler.py,
tests/test_citycatalyst_client.py, tests/test_citycatalyst_client_auth.py,
tests/test_citycatalyst_client_auth_contract.py,
tests/test_api_routes.py::MessageIdentityGateTests
================== 129 passed, 5 skipped, 6 warnings in 2.58s ==================
```

Previously 128 passed; the delta is the new persist-gate test. The five skips
are the env-gated live-Core contract cases.

Compile and diff checks:

```bash
uv run --directory service python -m compileall app   # exit 0
git diff --check                                      # exit 0
git diff --cached --check                             # exit 0
```

## Files changed

- `climate-advisor/service/app/routes/messages.py` — persist the payload bearer
  into thread context only when Core returned a canonical identity.
- `climate-advisor/service/tests/test_api_routes.py` — persist-on-503 test.
- `climate-advisor/README.md` — degrade-path non-persistence, expired
  thread-token recovery contract, qualified closure scope.
- `climate-advisor/docs/architecture.md` — same three qualifications on the
  trust-boundary section.
- `.superpowers/sdd/mirco-runtime-discovery-implementation-plan/task-5-report.md`
  — qualified the Task 5 closure claim and appended this section.

## Mandatory post-change skill results

### simplify-after-change

- The fix is one added conjunct on the existing `if token_from_payload:`
  condition; no helper, flag variable, or branch restructuring was introduced.
- The persistence block stays where it is, so message persistence, workflow
  context, and `touch_thread` ordering are unchanged.
- Added a comment at the gate explaining the strict/lenient token-class
  invariant, since the reason for the condition is not visible locally.
- No new imports, no dead code, no behavior change on the success path.

### docs-after-change

- `climate-advisor/README.md` message-contract section: the degrade path no
  longer persists a request-supplied bearer; expired thread tokens disable
  NativeInputCatalog until a new accepted bearer arrives; closure scope is
  qualified to request-supplied bearers and catalog paths.
- `climate-advisor/README.md` NativeInputCatalog section: explicit statement
  that the catalog path never refreshes and how recovery happens.
- `climate-advisor/docs/architecture.md` trust-boundary section: same three
  points, phrased for the request-flow context.
- Reviewed environment, setup, and deployment docs: no env var, command,
  output, or storage contract changed, so no edit was required there.

## Concerns and limitations

- The **I-1** chain is documented but still open in code: `POST /v1/threads` is
  unauthenticated and legacy inventory tools can still refresh from the body
  `user_id`. A follow-up ticket carrying that exact chain still needs to be
  filed; it was not created from this worktree.
- **I-3** is accepted as a documented functional limitation, not fixed. A chat
  whose thread token expires loses NativeInputCatalog for the rest of the
  thread unless the client sends a fresh bearer or an unrelated legacy
  inventory tool happens to refresh and persist one.
- The new test stubs `ThreadService`, `MessageService`, and the session
  factory, so it asserts the call contract rather than real persistence. The
  broad DB-backed `test_api_routes.py` classes were not run (unchanged from the
  prior fix pass).
- Review minors M-a through M-e and the six carried-over Task 5 minors were
  deliberately not addressed; the brief scoped this pass to I-1/I-2/I-3.
- No push, no PR, no Core change, no `threads.py` change, and the parent
  checkout was not touched.
