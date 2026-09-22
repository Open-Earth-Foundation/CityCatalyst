# Concept note processing and deletion regression checks

## Expected behavior

- An uploaded file stays **Processing** in the Context tab (both the subtitle and badge) while Clima is preparing its context, even after OCR reports `ready`. It becomes **Ready** when the context includes the uploaded evidence. Context failure must not leave a green Ready badge.
- Deletion waits for active document/context operations and source delivery. A source-cleanup HTTP 409 remains HTTP 409 through Climate Advisor, so the dialog explains that processing must finish before retrying. Other cleanup failures remain errors; the note must not disappear on failure.
- Deleting one note preserves shared city files and sources referenced by another note.

## Automated checks

From `app` in PowerShell:

```powershell
$env:NODE_OPTIONS='--experimental-vm-modules'
npx jest tests/concept-note-workspace-data.jest.tsx tests/concept-note-chat-utils.jest.ts tests/concept-note-deletion.jest.ts tests/concept-note-source-storage.jest.ts tests/concept-note-lifecycle-routes.jest.ts tests/concept-note-source-deletion-route.jest.ts --runInBand --coverage=false
```

From `climate-advisor`:

```powershell
.venv/Scripts/python.exe -m pytest service/tests/test_concept_note_lifecycle.py service/tests/test_citycatalyst_client.py -q
```

The component regression renders the actual Context tab with the workspace data hook. Backend lifecycle tests use isolated SQLite databases and mocked source cleanup; they check both preserved data on failure and successful deletion on retry. These checks do not prove deployed S3 permissions or live PostgreSQL cleanup.

## Dev browser retest

Use a disposable note in the development environment. Keep its run ID and URL for the reload checks.

1. Upload a PDF. Open Context while chat says **File received — processing**. Verify that both file labels show **Processing**, with no green Ready badge. Wait for context completion and verify both labels change to **Ready** and chat unlocks.
2. Repeat with context preparation failure/retry. Verify that failed preparation does not display Ready; use **Retry context** when offered.
3. Attempt deletion during processing. If the API returns 409, verify the dialog explains what must finish, remains open, and retains the note. Wait for completion and retry.
4. Delete the disposable note after processing. Verify the DELETE returns 204, the dialog closes, the note disappears, and it stays absent after reload. Check that its dedicated conversation is removed and another note sharing its source still opens correctly.

## If dev deletion still fails

Capture the failing `DELETE /api/v1/concept-notes/{runId}/?city_id=...` response status and timestamp. Do not share auth headers or cookies.

- **409:** an operation/source delivery is still active. Retry after it finishes. If it never finishes, inspect the run's context/draft status and the source job's delivery status; repeated clicking cannot repair a stuck worker.
- **503:** inspect Climate Advisor's `Concept Note workspace deletion failed` exception and the corresponding CityCatalyst internal source-cleanup request. Check service authentication, S3 list/delete permissions, and workspace/database errors. A generic error alone does not establish which dependency failed.
- **404:** refresh the authorized list to distinguish an already deleted note from an unavailable endpoint or lost access.

Verify that both web and Climate Advisor have deployed the relevant commits before interpreting a browser retest as validation of these fixes.

## Live investigation, 22–23 September 2026

- Reproduced HTTP 503 in the authenticated dev browser deleting the selected note named `test`, run `5952ca45-96a8-46a3-92a5-08400bd6033c`. Request ID: `cc-9a20463e-c67b-41f1-8fd7-c2552469674d`. Its context was ready, upload delivery complete, and all four draft chapters complete. The note remained accessible after failure.
- Ran the actual `InventoryFileStorageService` against a new disposable source in the configured `citycatalyst-files` bucket. Upload and listing succeeded; both batch deletion and a direct DeleteObject cleanup attempt failed. AWS identified the principal as `arn:aws:iam::004557241454:user/dev-s3-user` and reported that no identity policy allows `s3:DeleteObject`.
- Follow-up verification in OEF Grafana confirmed the **deployed** failure at `2026-09-22T12:57:56.989Z` (14:57:56 Warsaw): pod `cc-web-deploy-76f5dfc677-g8p8h` uses `arn:aws:iam::004557241454:user/s3_upload_openearth.cap`, which lacks `s3:ListBucket` on `arn:aws:s3:::citycatalyst-files`. The internal source-delete route returned 500, immediately followed by 503 on the selected run's DELETE at `12:57:56.996Z`. S3 request ID: `TN8RBP3TW4G1DFRY`.
- This corrects the earlier inference from the local storage probe: local `dev-s3-user` lacks DeleteObject, but the proven dev blocker is **ListBucket on a different identity**. The deployed identity's DeleteObject permission is not yet verified because listing fails first.

### IAM policy used for the dev retest

The statements in [cnb-source-delete-policy.json](./cnb-source-delete-policy.json) provide ListBucket constrained to CNB source/result prefixes and DeleteObject within those same prefixes. The IAM change was made outside this PR; upload/read permissions remain necessary.

### Why S3 blocks database deletion

`ConceptNoteLifecycleService.delete_run` calls CC source cleanup first, then deletes CNB workspace rows, then the CA thread/run. A source-cleanup exception exits before either database-deletion step. This is an application sequencing decision, not a database dependency on S3.

To let the note disappear even when storage is unavailable, a future change should persist a deletion/cleanup job with the source identities, hide the note, and retry CNB/CA/S3 cleanup idempotently until complete. Shared sources must remain protected. Simply ignoring the S3 error and dropping the database records would discard the current cleanup pointers and leave files behind.

On 23 September, after the IAM update, deletion of the same `test` note returned HTTP 204. The note disappeared from the concept-note list and remained absent after a browser reload. This validates the deployed deletion path for that note; it does not validate the UI changes in this PR, which are not yet deployed, or independently prove S3 object and database cleanup.

Clean up the disposable probe left by the earlier denied deletion:

```text
s3://citycatalyst-files/pdf-ocr/sources/concept_note_upload/eea691be-d5ee-4db9-b117-891e6b7da5ee/probe.md
```

No original note source was deleted by the direct storage probe. Only the new probe object was uploaded.
