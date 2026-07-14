# Proposed Tests

## Static Deployment Contract Test

### Overview

Add a file-based deployment contract test for the CityCatalyst web app and
Climate Advisor Kubernetes wiring. The goal is to catch broken service names,
ports, environment URLs, and service-key references before deployment.

This test should not read local `.env` files. The deploy-time source of truth in
this repository is the checked-in Kubernetes manifests plus the GitHub workflow
`kubectl set env` blocks:

- `k8s/**`
- `climate-advisor/k8s/**`
- `.github/workflows/web-*.yml`
- `.github/workflows/climate-advisor-*.yml`

The test should compute the effective deploy configuration for `dev`, `test`,
and `prod`, then compare the web and Climate Advisor sides of the integration.
This matters because some environments use manifest values directly, while prod
reuses a shared manifest and overrides values in the workflow.

### Contracts To Assert

For each environment, assert the following:

1. The web `CA_BASE_URL` points to the matching Climate Advisor Kubernetes
   Service.
   - `dev`: `http://climate-advisor-service-dev`
   - `test`: `http://climate-advisor-service-test`
   - `prod`: `http://climate-advisor-service-prod`

2. The Climate Advisor Service selector matches the matching Climate Advisor
   Deployment pod label.
   - Example: `service.spec.selector.app` must equal
     `deployment.spec.template.metadata.labels.app`.

3. The Climate Advisor Service port matches the web `CA_BASE_URL` port.
   - If the URL omits a port, treat HTTP as port `80`.
   - The Service `targetPort` must also match the Climate Advisor container
     port, currently `8080`.

4. Climate Advisor `CC_BASE_URL` points back to the matching CityCatalyst host.
   - Compare CA workflow `CC_BASE_URL` against the web workflow `HOST`.
   - This catches CA accidentally pointing test or prod at the wrong CC
     environment.

5. Web and Climate Advisor reference the same service API key secret.
   - Web must set `CC_SERVICE_API_KEY=${{ secrets.CC_SERVICE_API_KEY }}`.
   - CA must set `CC_API_KEY=${{ secrets.CC_SERVICE_API_KEY }}`.
   - The test compares the GitHub secret reference name, not the secret value.

6. Workflow path filters include the manifests and workflows being validated.
   - A change to a CA service/deployment manifest should trigger the CA workflow.
   - A change to a web deployment/service manifest should trigger the web
     workflow.

### Expected Behavior When Values Change

If a service name changes, the test should pass only when all dependent values
change together. For example, if `climate-advisor-service-test` is renamed to
`ca-test`, then the test should require web test `CA_BASE_URL` to become
`http://ca-test`.

If the Climate Advisor Service port changes from `80` to `8080`, the test should
require the web URL to include that port, for example
`http://climate-advisor-service-test:8080`. If the URL still omits the port, the
test should fail because HTTP defaults to `80`.

If only one side of the shared service key changes, the test should fail. Static
tests cannot prove the GitHub secret exists or that the runtime values match,
but they can prove both services reference the same secret name.

### What This Test Cannot Prove

This static test cannot verify live cluster state, DNS resolution, or the actual
secret value stored in GitHub or Kubernetes. Those require a post-deploy smoke
check. The static test is still valuable because it catches wrong names,
wrong ports, wrong environment URLs, and wrong secret references before deploy.

## Near-Deployment CC/CA Auth Contract Test

### Overview

Add a focused integration test pack that exercises the CityCatalyst and Climate
Advisor service-auth contract as close to deployment as the pull-request setup
can reasonably get.

This should use a real local CityCatalyst HTTP server, a real test database, the
real Climate Advisor client, and dummy CI secrets. It should not depend on live
EKS, live GitHub secret values, or public DNS.

Use deployment-shaped dummy values:

```text
CC_SERVICE_API_KEY=ci-shared-service-key
CC_API_KEY=ci-shared-service-key
VERIFICATION_TOKEN_SECRET=ci-jwt-secret
HOST=http://127.0.0.1:3000
CC_BASE_URL=http://127.0.0.1:3000/
CA_BASE_URL=http://127.0.0.1:8080
NEXT_PUBLIC_FEATURE_FLAGS=CA_SERVICE_INTEGRATION,STATIONARY_ENERGY_AGENTIC
```

### Reviewer Auth Concern To Cover

Milan's review adds one important requirement on top of the existing service-key
checks: every route that requires a proper CityCatalyst JWT must prove both that
the token is present and valid, and that the authenticated token subject is the
same user as the request is trying to act for.

The critical negative case is:

```text
token minted for USER_ID
request says user_id = OTHER_USER_ID
expected result: reject
```

So the test pack should not stop at "can we mint a token for user A" or "does a
route reject a missing token." It should also prove that a valid token for user
A cannot be reused to make requests for user B.

### Aligned Decisions

This test pack should follow the agreed shape:

- Keep `3` layers overall:
  1. static deployment contract test
  2. near-deployment pull-request auth contract test
  3. post-deploy runtime smoke
- In the PR layer, stay as close as possible to deployment behavior.
- Cover both sides of the CC/CA boundary:
  - app-side internal CA HTTP routes
  - Climate Advisor client and route surface
- On the CA side, cover every route that requires the scoped CityCatalyst bearer
  JWT. Today that means the Stationary Energy draft route surface; any new CA
  route that adopts the same scoped JWT contract should enter this matrix.
- Use true signed JWTs where possible.
- If an auth mismatch currently exposes a real issue, surface it in the test
  instead of smoothing it over. Do not change the expected assertion just to make
  the suite pass; decide any code fix explicitly once the issue is visible.
- Keep the cases in a reusable matrix and document every auth mismatch case.
- Do not expand this pass to generic CA `/v1/threads` and `/v1/messages` yet.

### Reusable Auth Mismatch Matrix

Apply the same matrix to the app-side internal CA routes and to the CA
Stationary Energy draft route surface.

| Case | App internal CA routes | CA Stationary Energy draft routes | Notes |
| ---- | ---------------------- | --------------------------------- | ----- |
| Happy path | succeeds | succeeds | use real seeded user, city, and inventory |
| Missing bearer token | reject | reject | expected `401` |
| Malformed `Authorization` header | reject | reject | expected `400` or `401` per route contract; not `500` |
| Invalid JWT | reject | reject through scoped CC auth failure | if this currently returns `500`, keep it visible as a real bug |
| Expired JWT | reject | reject through scoped CC auth failure | do not treat refresh-only behavior as a substitute for auth validation |
| JWT subject and request `user_id` mismatch | reject | reject | expected `403` |
| Wrong service key or service name | reject | n/a at direct CA route surface | app internal CA routes only |
| Wrong city, inventory, or draft ownership | reject | reject | expected permission failure |

### Additional Token-Exchange Coverage

For the CC/CA connection specifically, also cover the token handoff itself, not
only the downstream route authorization.

1. CityCatalyst must reject signed-but-wrong service JWT claims.
   - Build tokens signed with `VERIFICATION_TOKEN_SECRET` but with:
     - wrong `aud`
     - wrong `iss`
     - missing or empty `sub`
   - Send them to the internal CA capability routes with otherwise valid
     service headers.
   - Expected result: reject clearly, not `500`.
   - If current behavior accepts a token with the right signature but wrong
     `aud` or `iss`, surface that as an auth-contract issue.

2. CityCatalyst bridge routes must validate the token response before calling
   Climate Advisor.
   - Stub `/api/v1/internal/ca/user-token` to return `200` with malformed
     token payloads:
     - no `access_token`
     - `access_token: null`
     - `token_type` other than `Bearer`
     - missing, zero, negative, or non-numeric `expires_in`
   - Exercise CC routes that proxy to CA, for example
     `/api/v1/stationary-energy-drafts/start`.
   - Expected result: CC fails before making the CA request.
   - Assert CA is not called with `Authorization: Bearer undefined`,
     `Authorization: Bearer null`, or another malformed bearer value.

3. URL normalization must work in both directions.
   - CC to CA:
     - `CA_BASE_URL=http://climate-advisor-service-test/`
     - path `/v1/stationary-energy-drafts/start`
     - expected request URL:
       `http://climate-advisor-service-test/v1/stationary-energy-drafts/start`
   - CC to its own token endpoint:
     - `HOST=https://cc.example/`
     - expected token URL:
       `https://cc.example/api/v1/internal/ca/user-token/`
   - CA to CC:
     - `CC_BASE_URL=https://cc.example/`
     - expected refresh URL:
       `https://cc.example/api/v1/internal/ca/user-token`
   - These tests catch deploy failures where a trailing slash creates `//api` or
     `//v1` paths that behave differently through ingress or service routing.

4. Climate Advisor must validate the token response it receives from CC.
   - `CityCatalystClient.refresh_token(USER_ID)` should fail if CC returns:
     - no `access_token`
     - `token_type` other than `Bearer`
     - missing or non-positive `expires_in`
     - a JWT whose `sub` does not equal the requested `USER_ID`
     - unexpected `iss` or `aud`
   - This is the client-side mirror of Milan's point: CA should not silently
     accept a token for a different user and discover the mismatch only later.

5. Token issuance must remain user-scoped while inventory access is enforced by
   capability checks.
   - Confirm `/api/v1/internal/ca/user-token` can issue a token for an existing
     `USER_ID` when called with the correct `X-CA-Service-Key`.
   - Confirm the returned JWT does not claim inventory access just because
     `inventory_id` was passed to the token route.
   - Use that token against
     `/api/v1/internal/ca/capabilities/allowed-capabilities` for an inventory
     the user cannot access.
   - Expected result: token issuance may succeed, but the capability check must
     reject the inaccessible inventory with a clear permission failure.
   - This prevents false confidence from "the token minted successfully" when
     the real deployment failure is inventory or city scope authorization.

6. Nonexistent or deleted user token exchange must fail clearly.
   - CA calls `CityCatalystClient.refresh_token(DELETED_USER_ID)` or
     `refresh_token(UNKNOWN_USER_ID)`.
   - CC `/api/v1/internal/ca/user-token` returns `404`.
   - CA raises `TokenRefreshError` and preserves the HTTP status in the error.
   - Assert CA does not retry downstream capability calls after a failed token
     exchange for a nonexistent user.

7. Refresh-and-retry behavior must keep the same user binding.
   - Start with an expired token for `USER_ID`.
   - Make a CA client call that should refresh on expiry or first `401`.
   - Assert the refresh request asks CC for `USER_ID`, not another user.
   - Assert the retried request uses the refreshed bearer token.
   - Assert final `401` or `403` responses are preserved instead of hidden by
     generic retry errors.

8. Public CC bridge routes must derive the token user from the CC session.
   - Exercise the CC Stationary Energy draft proxy routes as logged-in
     `USER_ID`.
   - Assert CC calls `/api/v1/internal/ca/user-token` with
     `user_id = session.user.id`.
   - Assert CC forwards `user_id = session.user.id` to CA and does not trust a
     client-supplied `user_id`.
   - This covers the browser-to-CC-to-CA side of the connection, while the
     internal CA capability tests cover the CA-to-CC side.

9. Add a route-inventory guard for token-exchange coverage.
   - Every CC route under `/api/v1/internal/ca/capabilities/**` that imports
     `requireRequestUser` must either appear in the auth matrix or be explicitly
     exempted with a reason.
   - Current CC internal CA capability routes to cover:
     - `allowed-capabilities`
     - `ghgi/stationary-energy/load-context`
     - `ghgi/stationary-energy/commit-accepted`
     - `ghgi/stationary-energy/list-notation-keys` if included in this branch
     - `ghgi/stationary-energy/commit-notation-keys` if included in this branch
   - Every CA route that requires the scoped CC bearer token must either appear
     in the matrix or be explicitly exempted with a reason.

### App HTTP Contract Test

Create an app-side HTTP test, for example:

```text
app/e2e/internal-ca-service-auth.spec.ts
```

Run it against the real Next server that Playwright already starts on
`http://127.0.0.1:3000`.

Seed a fixed fixture before the tests:

```text
USER_ID=<fixed UUID>
OTHER_USER_ID=<fixed UUID>
CITY_ID=<fixed UUID>
INVENTORY_ID=<fixed UUID>
```

The fixture should include:

- a user with `userId = USER_ID`
- a second user with `userId = OTHER_USER_ID`
- an organization
- a project
- a city with `cityId = CITY_ID`
- an inventory with `inventoryId = INVENTORY_ID` and `cityId = CITY_ID`
- the membership and permissions needed for `USER_ID` to access that inventory

Test cases:

1. `POST /api/v1/internal/ca/user-token` rejects a missing
   `X-CA-Service-Key`.
   - Body: `{ user_id: USER_ID, inventory_id: INVENTORY_ID }`
   - Expected status: `401`

2. `POST /api/v1/internal/ca/user-token` rejects a wrong
   `X-CA-Service-Key`.
   - Header: `X-CA-Service-Key: wrong`
   - Expected status: `401`

3. `POST /api/v1/internal/ca/user-token` returns a deployment-compatible JWT.
   - Header: `X-CA-Service-Key: ci-shared-service-key`
   - Expected status: `200`
   - Verify the returned token with `VERIFICATION_TOKEN_SECRET`
   - Assert:
     - `sub === USER_ID`
     - `aud === "http://127.0.0.1:3000"`
     - `iss === "climate-advisor-service"`
     - `issued_by === "climate-advisor-service"`

4. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` rejects a
   malformed or invalid bearer JWT.
   - Use valid service headers.
   - Header: `Authorization: Bearer not-a-real-jwt`
   - Expected status: `401`
   - If this currently returns `500`, surface that as a real auth-contract issue
     before treating the auth contract as complete.

5. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` rejects a wrong
   `X-Service-Key`.
   - Use the JWT from the token route.
   - Headers:
     - `Authorization: Bearer <token>`
     - `X-Service-Name: climate-advisor`
     - `X-Service-Key: wrong`
   - Expected status: `401`

6. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` rejects a wrong
   `X-Service-Name`.
   - Headers:
     - `Authorization: Bearer <token>`
     - `X-Service-Name: wrong-service`
     - `X-Service-Key: ci-shared-service-key`
   - Expected status: `401`

7. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` rejects a valid
   service token when the JWT subject and request `user_id` do not match.
   - Mint the token for `USER_ID`.
   - Send `body.user_id = OTHER_USER_ID`.
   - Use valid service headers.
   - Expected status: `403`
   - Expected error indicates the authenticated service token user does not
     match the request user.

8. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` accepts a valid
   service token and matching service key.
   - Headers:
     - `Authorization: Bearer <token>`
     - `X-Service-Name: climate-advisor`
     - `X-Service-Key: ci-shared-service-key`
   - Body:

```json
{
  "user_id": "USER_ID",
  "city_id": "CITY_ID",
  "inventory_id": "INVENTORY_ID",
  "sector_code": "stationary_energy",
  "workflow_step": "draft"
}
```

   - Expected status: `200`
   - Expected response includes `ghgi.stationary_energy.load_context`

9. `POST /api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context`
   rejects a valid token for `USER_ID` when the request body says
   `OTHER_USER_ID`.
   - Use valid service headers.
   - Use a minimal valid load-context request body.
   - Expected status: `403`

10. `POST /api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context`
    accepts the same request when `body.user_id = USER_ID`.
    - Expected status: `200`

11. `POST /api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted`
    rejects a valid token for `USER_ID` when the request body says
    `OTHER_USER_ID`.
    - Use valid service headers.
    - Use a minimal valid commit request body.
    - Expected status: `403`

12. `POST /api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted`
    accepts the same request when `body.user_id = USER_ID`.
    - Expected status: `200`

This proves the real CityCatalyst route stack: HTTP, environment variables, JWT
signing, `apiHandler`, service headers, database user lookup, JWT subject
binding to the request user, and the permission gate.

### Climate Advisor Client Contract Test

Create a Climate Advisor pytest file, for example:

```text
climate-advisor/service/tests/test_citycatalyst_client_auth_contract.py
```

Run it while the local CityCatalyst server is still available on
`http://127.0.0.1:3000`.

Environment:

```text
CC_BASE_URL=http://127.0.0.1:3000/
CC_API_KEY=ci-shared-service-key
CA_AUTH_CONTRACT_USER_ID=<same USER_ID>
CA_AUTH_CONTRACT_OTHER_USER_ID=<same OTHER_USER_ID>
CA_AUTH_CONTRACT_CITY_ID=<same CITY_ID>
CA_AUTH_CONTRACT_INVENTORY_ID=<same INVENTORY_ID>
```

Test cases:

1. `CityCatalystClient.refresh_token(...)` succeeds against the running local
   CityCatalyst server with the shared key.
   - Assert a token is returned.
   - Assert `expires_in == 3600`.

2. `CityCatalystClient.get_stationary_energy_allowed_capabilities(...)`
   succeeds against the running local CityCatalyst server.
   - First call `refresh_token(...)`.
   - Then request allowed capabilities with the same user, city, and inventory.
   - Assert the response includes `ghgi.stationary_energy.load_context`.

3. A wrong `CC_API_KEY` receives a real `401` from CityCatalyst.
   - Set `CC_API_KEY=wrong-key`.
   - Reset Climate Advisor settings cache for the test.
   - Call `refresh_token(...)`.
   - Assert `TokenRefreshError`.
   - Assert the error includes `HTTP 401`.

4. A token minted for `CA_AUTH_CONTRACT_USER_ID` cannot be reused for
   `CA_AUTH_CONTRACT_OTHER_USER_ID`.
   - Call `refresh_token(CA_AUTH_CONTRACT_USER_ID)`.
   - Then call `get_stationary_energy_allowed_capabilities(...)` with:
     - `user_id=CA_AUTH_CONTRACT_OTHER_USER_ID`
     - the same `city_id` and `inventory_id`
     - the token minted for `CA_AUTH_CONTRACT_USER_ID`
   - Assert CityCatalyst rejects the request with a real `403`.
   - This proves the CC side enforces JWT subject binding instead of trusting
     the request body alone.

### Climate Advisor Route Subject-Binding Regression Test

Extend:

```text
climate-advisor/service/tests/test_stationary_energy_drafts.py
```

Add route-surface regression checks for the Stationary Energy draft endpoints:

1. `POST /v1/stationary-energy-drafts/start` rejects a bearer token for
   `USER_ID` when the payload says `user_id=OTHER_USER_ID`.
   - Expected status: `403`

2. `GET /v1/stationary-energy-drafts`,
   `GET /v1/stationary-energy-drafts/resume`, and
   `GET /v1/stationary-energy-drafts/{draft_run_id}` reject the same mismatch.
   - Expected status: `403`

3. `POST /v1/stationary-energy-drafts/{draft_run_id}/retry`,
   `POST /v1/stationary-energy-drafts/{draft_run_id}/review`, and
   `POST /v1/stationary-energy-drafts/{draft_run_id}/save` reject the same
   mismatch after seeding a ready draft for `USER_ID`.
   - Expected status: `403`

4. The Stationary Energy draft endpoints reject a missing `Authorization`
   header.
   - Expected status: `401`

5. The Stationary Energy draft endpoints reject a malformed `Authorization`
   header that is not `Bearer <token>`.
   - Expected status: `401`

These tests prove the CA route surface continues to pass through and enforce
the CC user-binding contract instead of only checking that some token exists.

### Scope Note

Apply the Milan user-binding test matrix to:

- the CC internal capability routes
- the CA Stationary Energy draft routes

Do not extend the same expectation to generic CA `/v1/threads` and
`/v1/messages` yet. Those routes currently accept `payload.user_id` and optional
context tokens, but they do not enforce a route-level bearer-token subject match
in the same way as the Stationary Energy draft flow.

### Small Climate Advisor Unit Checks To Keep

Some CA client behavior is still better tested with the existing stub client
because the running CC server does not expose raw outbound request details.
Extend `climate-advisor/service/tests/test_citycatalyst_client.py` with:

1. Missing `CC_API_KEY` fails before making a request.
   - Patch settings with `cc_base_url="https://cc.example"` and
     `cc_api_key=None`.
   - Assert `TokenRefreshError`.
   - Assert `_get_client` was not called.

2. `CC_BASE_URL` trailing slash does not create malformed URLs.
   - Use `base_url="https://cc.example/"`.
   - Expected token URL:
     `https://cc.example/api/v1/internal/ca/user-token`
   - This likely requires normalizing the base URL in `CityCatalystClient`.

3. Internal capability calls always include service headers.
   - Call `load_stationary_energy_context(...)` or
     `commit_stationary_energy_accepted(...)`.
   - Assert:
     - `X-Service-Name == "climate-advisor"`
     - `X-Service-Key == "test-api-key"`
     - `Authorization == "Bearer jwt-token"` when a token is passed.

4. Keep lightweight unsigned JWT fixtures only for CA-local unit scope where the
   CC boundary is mocked.
   - Do not use those fixtures as a replacement for the real signed-JWT app
     HTTP contract tests.

### CI Job Shape

Add one focused pull-request job, separate from the broad test suites:

```text
cc-ca-auth-contract
1. start Postgres
2. run CityCatalyst migrations and seeds
3. set dummy shared auth environment variables
4. build the CityCatalyst app
5. start the CityCatalyst app on 127.0.0.1:3000
6. seed the fixed auth fixture
7. run app/e2e/internal-ca-service-auth.spec.ts
8. run climate-advisor/service/tests/test_citycatalyst_client_auth_contract.py
9. clean up the fixed auth fixture
```

This is the closest pull-request-safe version of the deployment auth test. It
uses a real CC HTTP server, real CA client, real DB-backed user and inventory,
real JWT signing and verification, and real service-auth headers.

Yes, this should work in PR tests. The limitation is not JWT signing itself; the
limitation is that PR cannot prove live cluster DNS, deployed secret values, or
post-rollout pod state.

It still cannot prove EKS DNS, Kubernetes Secret values, or public host routing.
Those still require a post-deploy smoke check in the deployment workflow.

## Post-Deploy Runtime CA/CC Smoke Check

### Overview

If the goal is to get as close as possible to "this will not break after
deploy", the document still needs one runtime section.

The first two sections are strong, but they stop before the actual deployed pod
environment:

- the static contract test proves the checked-in manifests and workflow values
- the near-deployment auth contract test proves the code path in CI

They still do not prove:

- the real secret values applied by `kubectl set env`
- the real deployed `CA_BASE_URL` and `CC_BASE_URL`
- Kubernetes Service endpoints actually backing the Service name
- the newly rolled pods actually picked up the expected env
- CA to CC auth and CC to CA reachability from the deployed cluster

### Additions To Current Workflows

Add a post-deploy smoke phase to:

- `.github/workflows/web-develop.yml`
- `.github/workflows/web-test.yml`
- `.github/workflows/web-tag.yml`
- `.github/workflows/climate-advisor-develop.yml`
- `.github/workflows/climate-advisor-test.yml`
- `.github/workflows/climate-advisor-tag.yml`

At minimum:

1. Wait for rollout completion before any smoke check.
   - Run `kubectl rollout status` after `kubectl rollout restart`.
   - This is especially missing in the current web workflows and in
     `climate-advisor-develop.yml`.

2. Assert the CA Service has live endpoints.
   - Example target:
     `climate-advisor-service-dev`, `climate-advisor-service-test`,
     `climate-advisor-service-prod`
   - Fail if the endpoints list is empty.

3. Run a CC to CA reachability smoke inside the cluster.
   - Minimal version: from a disposable pod or a web pod, call
     `GET $CA_BASE_URL/health`.
   - This proves the runtime `CA_BASE_URL`, Service name, port, and CA pod
     listener are wired correctly.
   - This is useful, but not sufficient on its own because CA `/health` is
     currently shallow and does not verify CC connectivity.

4. Run a CA to CC auth-contract smoke inside the deployed CA pod.
   - Use the real deployed CA environment, not local CI env.
   - This proves the runtime `CC_BASE_URL`, `CC_API_KEY`, CC route auth,
     token issuance, and internal capability auth all work after deploy.

### Exact Shape For The CA To CC Smoke

Add a small script, for example:

```text
climate-advisor/service/scripts/smoke_cc_contract.py
```

Run it from the deployed CA pod with `kubectl exec`.

Use the existing `CityCatalystClient` rather than a duplicate ad hoc HTTP
implementation.

Required non-secret env for each environment:

```text
CA_SMOKE_USER_ID=<fixed UUID>
CA_SMOKE_CITY_ID=<fixed UUID>
CA_SMOKE_INVENTORY_ID=<fixed UUID>
```

The script should:

1. Call `CityCatalystClient.refresh_token(CA_SMOKE_USER_ID)`.
   - Fail if token refresh returns non-200.

2. Parse the returned JWT claims without logging the token.
   - Assert `iss == "climate-advisor-service"`.
   - Assert `aud` matches the expected CityCatalyst host for the environment.

3. Call
   `get_stationary_energy_allowed_capabilities(user_id=..., city_id=..., inventory_id=..., workflow_step="draft")`.
   - Fail if the response is `401`, `403`, `404`, or `5xx`.

4. Assert the capability list contains:
   - `ghgi.stationary_energy.load_context`

5. Print only pass/fail diagnostics.
   - Never print the shared key or the JWT value.

This is the strongest check for the exact class of failure you described:
wrong shared key, wrong `CC_BASE_URL`, wrong `HOST` audience, or broken CC
internal auth after deploy.

### Deterministic Smoke Fixture Requirement

The current setup does not yet create a stable smoke user, city, and inventory.

Current repo state:

- `db:seed` runs, but it does not create a fixed CA/CC integration fixture
- `create-admin` creates an admin user, but the `userId` is random
- there is no checked-in deterministic `cityId` and `inventoryId` pair for this smoke

So, to make the runtime smoke reliable, add one small deterministic fixture
path, for example:

```text
app/scripts/upsert-ca-smoke-fixture.ts
k8s/cc-ca-smoke-fixture.yml
```

That fixture should upsert fixed IDs for:

- one smoke user
- one project
- one city
- one inventory
- the membership needed for the user to access that inventory

This is practical in the current repo because deployment already runs one-off
jobs for `db:seed` and `create-admin`.

### Optional Stronger CC To CA Smoke

Once the deterministic fixture exists, add one stronger CC to CA smoke on top
of `GET /health`.

Preferred shape:

- hit a real CC path that proxies to CA using the smoke user and inventory
- for example a chat-thread creation path or a Stationary Energy draft-start path

That would prove:

- CC can issue the CA user token with the deployed shared key
- CC can reach the deployed CA service
- CA accepts the issued JWT
- the full CC to CA runtime path works in the deployed environment

### Recommended Final Test Stack

To get the strongest realistic coverage, keep all three layers:

1. Static deployment contract test
2. Near-deployment local auth contract test
3. Post-deploy runtime smoke from the deployed pods

That still cannot make failure literally impossible, but it closes the main gap
that remains after PR testing: actual deployed env, actual cluster wiring, and
actual cross-service auth after rollout.
