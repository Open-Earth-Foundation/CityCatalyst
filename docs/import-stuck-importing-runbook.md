# Runbook: import stuck in `importing` (CC-1201)

## Symptom

A new screen or bulk import for an inventory is rejected (`import_in_progress` / "Another import is already processing for this inventory"), and the inventory has an `ImportedInventoryFile` row in status `importing` that does not finish.

## Cause

Approval reserves the inventory by moving the file to `importing`. If the server process stops mid-import (crash, redeploy, instance replacement), or the final `failed` update cannot be written, nothing moves the row out of `importing`. There is no automatic lease or expiry. This is an accepted limitation of CC-1201 (decision: David, 2026-11-03).

## Before changing anything

1. Confirm the import is really abandoned: no app instance is still running that import, and the row's `last_updated` is older than the longest normal import (check recent completed imports for the inventory; use at least 30 minutes).
2. Inspect the row:

```sql
SELECT id, inventory_id, import_status, last_updated, error_log,
       review_history IS NOT NULL AS has_history
FROM "ImportedInventoryFile"
WHERE inventory_id = '<inventory-id>' AND import_status = 'importing';
```

3. If `has_history` is true, the import already committed. Do not mark it failed; set it to `completed` only after confirming inventory values exist for that file, and ask the CC-1201 owner first.

## Recovery

Mark only the stuck row as failed (this keeps the record and its error, as the retry contract requires):

```sql
UPDATE "ImportedInventoryFile"
SET import_status = 'failed',
    error_log = 'Marked failed by operator: import interrupted while importing (CC-1201 runbook)',
    last_updated = NOW()
WHERE id = '<imported-file-id>'
  AND import_status = 'importing'
  AND review_history IS NULL;
```

Do not touch `review_history`; a database trigger rejects changes to a non-null value. Run in a transaction and check that exactly one row was updated.

## After recovery

The user must upload the file again and review the row decisions again. The failed record is not re-approved and decisions are not inherited. Record the action in the incident or ticket.
