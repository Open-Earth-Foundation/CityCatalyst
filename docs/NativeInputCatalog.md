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

Producer modules will call this contract in follow-up work. CC-636 intentionally does not wire GHGI, HIAP, HIAP-MEED, CNB, or Clima discovery call sites.
