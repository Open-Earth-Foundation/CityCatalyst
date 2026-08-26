# CC-730 Krakow local demo

This directory is a portable snapshot of the Krakow Fast Tram Stage IV Concept
Note Builder run used to exercise the missing-information flow. It lets another
developer check out the branch, seed both Climate Advisor databases, sign in as
a deterministic local CityCatalyst user, and open the same review state.

## Included data

- `krakow-kst-iv-project-brief.pdf`: the eight-page source document that was
  used for the Krakow demo. SHA-256:
  `8a1f58d9906785c3898e01d6acb9a41427207021788df0b874a521615fcea417`.
- `krakow-demo.json`: a sanitized snapshot containing:
  - the European Investment Bank funder profile;
  - the EIB Private Sector Loans funding opportunity;
  - the 12-chapter CityCatalyst EIB starter template;
  - one CA run, its assembled context, upload metadata, thread, and eight chat
    messages;
  - 12 chapters, 25 immutable revisions, 62 structured gaps, five resolution
    events, and one chapter confirmation.
- `service/scripts/seed_cnb_demo_fixture.py`: the idempotent local seeder.

The JSON deliberately contains no access token, cookie, password, message tool
payload, or S3 object key. User and city ownership are placeholders replaced by
the seed command. The tracked PDF is public-project test material; it is not an
official EIB application form.

## Seed on a clean local checkout

Run the normal CityCatalyst and Climate Advisor setup first. The commands below
assume PowerShell and the repository root as the starting directory.

### 1. Prepare the two Climate Advisor databases

```powershell
cd climate-advisor
docker compose up -d postgres

# First run only. Skip this command if the cnb database already exists.
docker exec climate-advisor-db createdb -U climateadvisor cnb

$env:CA_DATABASE_URL = "postgresql://climateadvisor:climateadvisor@localhost:5433/climateadvisor"
$env:CNB_DATABASE_URL = "postgresql://climateadvisor:climateadvisor@localhost:5433/cnb"

uv run --directory service alembic upgrade head
uv run --directory service alembic -c cnb-alembic.ini upgrade head
```

### 2. Create a deterministic local CityCatalyst user and Krakow city

On a clean app database, reuse the existing CA smoke-fixture script with Krakow
overrides. `CA_SMOKE_USER_PASSWORD` is local-only and must not be committed.

```powershell
cd ..\app
$env:CA_SMOKE_CITY_ID = "f8063baa-e795-4ffb-a507-7a2ea6090eae"
$env:CA_SMOKE_CITY_NAME = "Kraków"
$env:CA_SMOKE_CITY_LOCODE = "PL-KRK"
$env:CA_SMOKE_USER_PASSWORD = "choose-a-local-password"
npm run upsert-ca-smoke-fixture
```

This creates the default demo owner
`11111111-1111-4111-8111-111111111111` with email
`ca-smoke@citycatalyst.local`. If an existing local account already owns the
Krakow city, skip this step and pass that account's user and city UUIDs to the
seed command instead.

### 3. Seed the Concept Note snapshot

```powershell
cd ..\climate-advisor
$env:CA_DATABASE_URL = "postgresql://climateadvisor:climateadvisor@localhost:5433/climateadvisor"
$env:CNB_DATABASE_URL = "postgresql://climateadvisor:climateadvisor@localhost:5433/cnb"

uv run --directory service python -m scripts.seed_cnb_demo_fixture
```

The command is safe to rerun: every record is upserted by its stable primary
key, and unrelated local records are not deleted.

To attach the snapshot to an existing local account without replacing any run
that already uses the fixture UUID, supply a new run UUID. All run-scoped
chapter, revision, gap, audit, upload, thread, and message UUIDs are then
remapped into that run's deterministic namespace.

```powershell
uv run --directory service python -m scripts.seed_cnb_demo_fixture `
  --user-id <local-user-uuid> `
  --city-id <accessible-city-uuid> `
  --run-id <new-run-uuid>
```

### 4. Run and open the app

Start Climate Advisor and CityCatalyst using the normal local commands. Sign in
as the user chosen in step 2, then open the URL logged by the seed command. With
the default identifiers it is:

```text
http://localhost:3000/en/cities/f8063baa-e795-4ffb-a507-7a2ea6090eae/concept-notes/e7cca88d-de54-4050-88ed-d6b39790853b/
```

## Flow checks

1. Click **Start the interview**. The chat scrolls to the latest focused gap.
2. Click **Answer**, enter a confirmed fact, and submit it from the compact chat
   input. The resolution remains visible as an audit card.
3. Polling should show the affected chapter regenerating and returning to
   Draft. The review-only impact tool may identify additional chapter numbers
   and rewrite those chapters with the same answer.
4. Use **Review & confirm** to move the current revision to Ready. The model must
   not mark it Ready on its own.
5. Upload `krakow-kst-iv-project-brief.pdf` again from the Context flow to test
   evidence rechecking and proposed revisions without overwriting confirmed
   content.

Answer submission and cross-chapter rewriting require the configured LLM
provider key. If regeneration fails, the answer should remain recorded and the
chapter should expose a retryable failure state.

The fixture is a reviewed snapshot, not a raw database dump. If it is refreshed,
review the JSON diff carefully, especially chat text and newly added context
fields. Raw database dumps and `.env` files must never be added here.
