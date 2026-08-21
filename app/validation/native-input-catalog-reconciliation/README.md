# Native input catalog reconciliation validation

This harness runs the reconciliation scanner against an isolated Postgres database created from the app's real migrations. It never connects to a development or production database.

The fixture set is intentionally small:

- two GHGI imported files;
- one matching active catalog registration;
- one catalog registration with no producer source, to exercise `dangling`;
- one missing registration, to exercise `missing`;
- a database role used by the scanner with `SELECT` privileges only.

Run from this directory:

```sh
docker compose up --build --abort-on-container-exit --exit-code-from dry-run
```

The scanner uses a page size of two and emits the complete JSON report. A non-zero exit code means the scan was incomplete or the read-only assertion failed.

The isolated apply/rollback validation is explicit and separate:

```sh
docker compose up --build --abort-on-container-exit --exit-code-from apply-and-rollback apply-and-rollback
```

It uses a catalog-only writer role, asserts that source tables are not writable, verifies one deterministic repair, removes only that fixture-created catalog row with the admin role, and confirms that the two source rows remain unchanged. It never connects to a real database.

## Public GitHub Actions sandbox

The repository also contains a manual public workflow at `.github/workflows/native-input-catalog-reconciliation-sandbox.yml`. It runs the disposable dry-run first, publishes the aggregate report and JSON artifact, then runs the disposable apply/rollback check. It has no secrets, no production endpoint, and no production database credentials.

The workflow is intentionally limited to sandbox validation. A future production workflow must be separate, use a protected GitHub Environment, and require human approval before receiving any environment secret or running `apply`.
