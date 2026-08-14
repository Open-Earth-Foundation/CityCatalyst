# CNB schema migrations

This Alembic chain owns the Concept Note Builder workspace and funding-reference
schema. Infrastructure provisioning and curated production data remain managed
outside this repository.

Set `CNB_DATABASE_URL` and run commands from `climate-advisor/service`:

```bash
alembic -c cnb-alembic.ini current
alembic -c cnb-alembic.ini upgrade head
```

The chain records its revision in `cnb_alembic_version`. It must never receive
`CA_DATABASE_URL`, and the default Climate Advisor chain must never run against
the CNB database. The initial migration creates schema only and inserts no
funders, opportunities, projects, or example data.

Use only rotated credentials from the environment's secret manager. Passwords
containing reserved URL characters must be URL-encoded before constructing the
DSN; never paste or print the resulting value in migration logs.
