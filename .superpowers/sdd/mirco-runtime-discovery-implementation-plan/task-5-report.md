# Task 5 Report: Validate Core identity and disable catalog refresh from claimed user IDs

## Outcome

Task 5 closes the request-identity escalation path introduced by runtime
NativeInputCatalog discovery.

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
