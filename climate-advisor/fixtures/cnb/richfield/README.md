# Richfield local CNB demo

This directory is a portable snapshot of the Richfield, Minnesota flood-risk
Concept Note Builder run. It exercises an eight-section Minnesota Flood Hazard
Mitigation Grant Assistance Program application using a real municipal
stormwater study and a reviewed Minnesota DNR reference corpus.

## Included data

- `richfield-flood-risk-prioritization.pdf`: the 55-page August 2025 City of
  Richfield stormwater model and flood-risk prioritization study prepared by
  Barr Engineering Co. SHA-256:
  `8fa3de7a6a0a04c75def7fc65df4cfdef61bc484e9d169a0f49621b598930f32`.
- `richfield-demo.json`: a sanitized snapshot containing:
  - the Minnesota Department of Natural Resources funder profile;
  - the Flood Hazard Mitigation Grant Assistance Program opportunity;
  - the eight-section application template, 18 criteria, seven source records,
    32 evidence records, and 15 example funded projects;
  - one CA run, its assembled document context, upload metadata, and thread;
  - eight draft chapters, eight immutable revisions, and 83 structured gaps.
- `service/scripts/seed_cnb_demo_fixture.py`: the shared idempotent local seeder.

The fixture contains no access token, cookie, password, raw message tool
payload, S3 object key, or thread permission context. User and city ownership
are placeholders replaced by the seed command. Internal identifiers and
fingerprints are removed from LLM-facing context; database fields that require
ingestion references use deterministic fixture-only values.

The source report is concept-level planning material. Its costs are stated in
2025 US dollars and should not be treated as final engineering estimates.

## Seed on a local checkout

Apply the normal Climate Advisor and managed-CNB migrations first. From
`climate-advisor`, configure both database URLs and run the shared seeder with
the Richfield fixture path:

```powershell
$env:CA_DATABASE_URL = "postgresql://climateadvisor:climateadvisor@localhost:5433/climateadvisor"
$env:CNB_DATABASE_URL = "postgresql://climateadvisor:climateadvisor@localhost:5433/cnb"

uv run --directory service python -m scripts.seed_cnb_demo_fixture `
  --fixture ../fixtures/cnb/richfield/richfield-demo.json `
  --user-id <local-user-uuid> `
  --city-id <accessible-richfield-city-uuid>
```

The command is safe to rerun: records are upserted by stable primary key and
unrelated local data is not deleted. To avoid replacing a run that already uses
the fixture UUID, also provide `--run-id <new-run-uuid>`. The seeder then
deterministically remaps the run-scoped chapter, revision, gap, upload, thread,
message, resolution, review, evidence-link, and match UUIDs.

After starting Climate Advisor and CityCatalyst, sign in as the selected local
user and open the route logged by the seed command.

## Flow checks

1. Confirm that all eight application sections load with their draft content.
2. Start the interview and verify that the 83 evidence gaps are available for
   structured answer, skip, and defer actions.
3. Submit a confirmed fact and verify that the answer remains visible in the
   audit history while the affected section regenerates.
4. Review the funding breakdown, flood-damage summary, mitigation measures,
   project analysis, and project financing sections against the source PDF.
5. Confirm that reference matching can use the tracked Minnesota DNR examples
   without requiring the original research database.

Answer submission and regeneration require the configured LLM provider key.
The fixture is a reviewed snapshot, not a raw database dump. Review JSON diffs
carefully when refreshing it, especially context fields and reference evidence.
