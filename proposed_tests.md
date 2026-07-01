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
CITY_ID=<fixed UUID>
INVENTORY_ID=<fixed UUID>
```

The fixture should include:

- a user with `userId = USER_ID`
- an organization
- a project
- a city with `cityId = CITY_ID`
- an inventory with `inventoryId = INVENTORY_ID` and `cityId = CITY_ID`

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

4. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` rejects a wrong
   `X-Service-Key`.
   - Use the JWT from the token route.
   - Headers:
     - `Authorization: Bearer <token>`
     - `X-Service-Name: climate-advisor`
     - `X-Service-Key: wrong`
   - Expected status: `401`

5. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` rejects a wrong
   `X-Service-Name`.
   - Headers:
     - `Authorization: Bearer <token>`
     - `X-Service-Name: wrong-service`
     - `X-Service-Key: ci-shared-service-key`
   - Expected status: `401`

6. `POST /api/v1/internal/ca/capabilities/allowed-capabilities` accepts a valid
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

This proves the real CityCatalyst route stack: HTTP, environment variables, JWT
signing, `apiHandler`, service headers, database user lookup, and the permission
gate.

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
