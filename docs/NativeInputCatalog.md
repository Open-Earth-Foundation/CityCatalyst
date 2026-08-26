# NativeInputCatalog Foundation

Implementation contract for [CC-636](https://linear.app/openearth/issue/CC-636/implement-the-nativeinputcatalog-foundation-in-citycatalyst-core), based on the [native document storage architecture](./NativeDocumentStorageArchitecture.md).

## Role

`NativeInputCatalog` is a CityCatalyst Core lookup table. It stores pointers and scope metadata so consumers can discover durable city inputs and generated artifacts. The owning module remains the source of truth for the underlying data and files.

The catalog does not copy module content, grant access, or expose S3 credentials. Access continues through CityCatalyst authentication and module capability boundaries.

## Row contract

| Field | Contract |
|---|---|
| `id` | Immutable UUID catalog identity |
| `kind` | Soft string describing the input or artifact kind |
| `owning_module` | Soft string identifying the source module |
| `source_type`, `source_id` | Pointer to the authoritative module record |
| `user_id`, `inventory_id`, `city_id`, `project_id`, `organization_id` | Nullable scope identifiers; the service requires at least one |
| `availability` | `active`, `withdrawn`, or `superseded` |
| `superseded_by_id` | New catalog ID replacing a superseded row |
| `content_digest` | Optional content/result digest |
| `markdown_ready` | Optional readiness flag for Markdown-capable artifacts |
| `labels` | Optional JSON metadata |

`source_id` is stored as a string and the scope fields have no cross-database foreign keys. The database has a partial unique index on `(source_type, source_id)` for rows that are not withdrawn.

## Lifecycle invariants

1. Registration is idempotent for a non-withdrawn source identity.
2. A withdrawn source can be registered again with a new immutable catalog ID.
3. Withdrawal preserves the catalog row for auditability and excludes it from normal active lookup.
4. Supersession creates a new row, then marks the previous active row as `superseded` and points it to the replacement.
5. Scope validation is enforced in the registration service; future product rules may refine allowed scope combinations.
6. `kind`, `owning_module`, and `source_type` remain soft strings so new producers do not require a Core migration.

## Internal endpoints

All endpoints require non-empty `X-Service-Name` and a matching `X-Service-Key` (`CC_SERVICE_API_KEY`).

- `POST /api/v1/internal/native-input-catalog` — idempotently register a pointer.
- `DELETE /api/v1/internal/native-input-catalog/{id}` — withdraw a pointer.
- `POST /api/v1/internal/native-input-catalog/{id}/supersede` — create a replacement and supersede the current row.

Producer modules call this contract at their durable write boundaries. CC-636 established the shared contract; producer mappings below document the follow-up integrations.

## GHGI producer mapping (CC-637)

GHGI registers three durable identities through the shared service:

| Catalog kind | Source type / identity | Registration boundary | Markdown |
|---|---|---|---|
| `inventory_source_file` | `imported_inventory_file` / `ImportedInventoryFile.id` | After the uploaded file row and its storage object are durable | `false` |
| `inventory_import` | `inventory` / `Inventory.inventoryId` | After `ImportedInventoryFile.importStatus` becomes `completed` | `null` |
| `inventory_ocr` | `pdf_ocr_job` / `PdfOcrJob.id` | After the OCR job is `succeeded` with result digest, page count, and stored Markdown | `true` |

`PdfOcrJob.id` is the stable OCR-result identity across retries. A new uploaded source creates a new imported-file row and a new OCR job, while repeated registration of an existing identity remains idempotent. Catalog failures are logged and retried from normal status polling or the OCR cron without rerunning import extraction or OCR. Inventory and city deletion withdraws active GHGI rows before the owning records are removed.

## Legacy HIAP producer mapping (CC-638)

Legacy HIAP remains authoritative in its existing CityCatalyst tables. The adapter registers only durable, reusable pointers after the corresponding write boundary completes.

| Catalog kind | Source type / identity | Registration boundary | Version / withdrawal |
|---|---|---|---|
| `hiap_ranking` | `hiap_ranking` / `HighImpactActionRanking.id + ranked-content-digest` | Ranking status is `SUCCESS` and ranked rows exist | A changed persisted result gets a new source identity; older versions are superseded |
| `hiap_selection` | `hiap_ranked_selection` / `rankingId + actionId` | Ranked selection commit completes | One row per selected action; stale selections are withdrawn |
| `hiap_selection` | `hiap_unranked_selection` / `inventoryId + actionType + actionId` | Unranked selection commit completes | One row per selected action; stale selections are withdrawn |
| `hiap_action_plan` | `action_plan` / `ActionPlan.id + content-digest` | Action plan row is created or updated | A changed upsert gets a new catalog ID and supersedes the previous version |

Selection identities use logical action IDs rather than language-specific row UUIDs because legacy HIAP mirrors ranked selection flags across languages. The catalog stores scope, source identity, digest, and small provenance labels; it does not copy ranking, selection, or plan content.

Action-plan deletion withdraws all active versions before the source row is removed. Inventory and city deletion withdraw all active HIAP rows before the owning records are removed. Failed, pending, incomplete, or temporary HIAP results are never registered. The HIAP cron backfills successful rankings and persisted action plans that are missing their current active catalog entry, so a transient catalog failure can be retried on a later run. HIAP-MEED uses a separate adapter and is intentionally not covered by CC-638.

## HIAP-MEED ranking producer mapping (CC-736)

The first CC-736 slice registers the completed MEED ranking artifact produced by the CityCatalyst ranking route. `MeedRanking` is the durable source record; `MeedActionRanked` and `MeedActionRemoved` are version-linked child rows.

| Catalog kind | Source type / identity | Registration boundary | Version / withdrawal |
|---|---|---|---|
| `hiap_meed_ranking` | `hiap_meed_ranking` / `inventoryId:userId-or-anonymous:inputDigest:contentDigest` | After a successful MEED response is persisted as a completed `MeedRanking` with at least one child action | Identical retries reuse the source/version; changed result digests create a new parent and supersede the prior active catalog row for that inventory/user stream |

The catalog stores the parent pointer, digests, action count, language/top-N metadata, and resolved inventory/city/project/organization scope. It does not copy ranked actions, removed actions, explanations, evidence, or legal payloads. Incomplete, failed, empty, or request-local results are not registered. Inventory and city deletion withdraw active MEED ranking entries while retaining catalog audit rows. The operational `npm run hiap-catalog-backfill` runner scans completed rankings in bounded, resumable pages and retries failed catalog writes using the shared `HiapCatalogBackfillCheckpoint` state.

Report/output-plan artifacts and caller-provided city data, context, preferences, and exclusions remain out of scope until each has a durable, reusable CityCatalyst source record.
