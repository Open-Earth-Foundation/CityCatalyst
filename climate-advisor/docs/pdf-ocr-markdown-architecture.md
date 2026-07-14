# Climate Advisor PDF OCR to Markdown Architecture

Status: Draft

Last updated: 2026-07-14

## Decision Summary

Climate Advisor (CA) will provide one shared CityCatalyst PDF-to-Markdown
converter using Mistral OCR. It supports inventory imports first and uses the
same contract for Concept Note uploads. The first version uses the existing CA
pod and adds no separate OCR worker, Kubernetes workload, persistent volume, or
public upload endpoint.

The key decisions are:

- CityCatalyst authenticates the user and owns the source upload/storage
  boundary. The existing inventory upload path is reused; the Concept Note
  upload route will use the same storage boundary. CA never becomes the durable
  owner of the source PDF.
- CA accepts work asynchronously and stores job state in its own PostgreSQL
  database.
- The public conversion key is the pair `(source_type, source_id)`. There is no
  second OCR job ID and no hash-based idempotency scheme.
- The existing CA process runs at most two PDF jobs concurrently.
- CA PostgreSQL stores only OCR job state and source metadata, never PDF, chunk,
  Markdown, or S3-key contents.
- During conversion, CA downloads a temporary working copy and creates chunks on
  the pod's ephemeral filesystem. They are deleted after each attempt.
- Final Markdown is stored under `pdf-ocr/results/` in the existing
  CityCatalyst S3 setup. CityCatalyst gives CA a short-lived signed PUT URL for
  the exact result object. CA uploads the Markdown itself but has no persistent
  S3 credentials or bucket permissions. CityCatalyst verifies the uploaded
  object and stores the authoritative result S3 key in the CC database.
- CA stops after producing Markdown. It does not extract rows, map schemas,
  validate business data, or trigger another workflow.

The MVP supports PDFs up to 20 MB. The inventory-import endpoint already
enforces this limit, and the Concept Note upload route must enforce the same
limit. A later increase must be coordinated across upload and conversion paths.

## Scope

Included:

- PDF validation, page-range chunking, Mistral OCR, ordered Markdown merging,
  result storage, retries, and status reporting.
- A durable PostgreSQL queue that survives pod restarts.
- Two active conversions with one Mistral request per conversion.

Excluded:

- Vision refinement, image descriptions, structured extraction, schema mapping,
  database loading, callbacks, and workflow continuation.
- Page, chunk, percentage, or stage progress in the public API.
- A separate OCR pod, Deployment, Service, HPA, PV, or PVC.
- Multiple CA replicas or Uvicorn workers before a distributed OCR limiter
  exists.

## System Flow

```mermaid
flowchart LR
    User["User"] --> CC["CityCatalyst upload"]
    CC --> Source["Existing CityCatalyst S3<br/>source PDF"]
    CC --> Start["CA start endpoint"]
    Start --> Queue[("PostgreSQL OCR queue")]
    Queue --> Worker["Existing CA pod\nmaximum 2 active jobs"]
    CC --> SourceURL["Short-lived signed GET URL"]
    SourceURL --> Worker
    SourceURL -. authorizes read .-> Source
    Worker --> Temp["Ephemeral PDF and chunks"]
    Temp --> Mistral["Mistral OCR"]
    Mistral --> Merge["Page-ordered Markdown merge"]
    CC --> ResultAccess["Short-lived signed result URLs"]
    Merge --> ResultAccess
    ResultAccess -. writes or reads .-> Results["Existing CityCatalyst S3<br/>pdf-ocr/results/"]
    Worker --> Register["CC verifies + registers result"]
    Register --> ResultRecord[("CC PostgreSQL<br/>result pointer")]
    CC --> Status["Status and Markdown endpoints"]
    Status --> Queue
    Status --> ResultAccess
```

## Service Boundary

| Component                | Responsibility                                                          |
| ------------------------ | ----------------------------------------------------------------------- |
| CityCatalyst             | Authorization, source/result pointers, S3 access, and signed URLs.      |
| CA API                   | CC-proxied start, status, retry, and Markdown endpoints.                 |
| CA dispatcher            | Queue claiming, validation, OCR, retries, merge, upload, and cleanup.   |
| CC PostgreSQL            | Source records and the authoritative final Markdown S3 pointer.         |
| CA PostgreSQL            | Durable job status, attempts, leases, timestamps, and sanitized errors. |
| Existing CityCatalyst S3 | Durable source PDFs and final Markdown artifacts in separate prefixes.  |
| Mistral                  | PDF page OCR and Markdown generation.                                   |

The conversion is complete when status is `succeeded` and the Markdown is
downloadable. Any later use of that Markdown belongs to the caller.

## Source Identity

Every source is identified by a namespaced pair:

| `source_type`         | `source_id`                      | Resolver access check                       |
| --------------------- | -------------------------------- | ------------------------------------------- |
| `inventory_import`    | `ImportedInventoryFile.id`       | Imported file plus current inventory access |
| `concept_note_upload` | `concept_note_uploads.upload_id` | CC source record plus project/city access   |

`source_type` selects a CityCatalyst resolver that checks access and locates the
source object. It does not select a model, prompt, post-processing step, queue,
or result format. Both types run through exactly the same PDF-to-Markdown code.

For a Concept Note PDF, the authenticated CC upload route creates two records
with the same `upload_id`: a CC stored-file record owns the immutable S3 pointer,
metadata, uploader, and project/city access scope; the CNB upload record owns the
association to `run_id`. The CN domain route verifies the run association before
calling CA, while later signed-URL grants use the CC record and current CC
permissions. This avoids giving CityCatalyst direct access to the CNB database.
The legacy `UserFile` model is not reused.

The distinction rules are:

- `(source_type, source_id)` is unique in the OCR job table.
- The same pair reuses its existing job. The same UUID under another type is a
  different source.
- Each PDF in a Concept Note run gets its own `upload_id`; `run_id`, filename,
  S3 key, and file hash are never conversion keys.
- Replacing or re-uploading a file creates a new source ID. An explicit retry
  keeps the same pair and increments only the attempt number.
- Inventory and Concept Note parent IDs remain in their owning records. CA does
  not branch on them or store them as conversion identity.
- Supported source types are validated by an application resolver registry, so
  a future caller adds a resolver without changing the OCR pipeline.
- Browser-facing inventory and Concept Note routes set the source type
  server-side and translate their natural domain IDs to the pair. A browser does
  not gain access by choosing another source type or guessing an ID.

## API and Authentication

OCR introduces no new authentication method, token type, API key, or
browser-to-CA path:

- The browser continues to call authenticated, domain-specific CityCatalyst
  routes only.
- CityCatalyst reuses the current CA integration: it obtains the existing
  user-scoped JWT through `POST /api/v1/internal/ca/user-token` using
  `X-CA-Service-Key`, then calls CA with `Authorization: Bearer <token>`.
- CA requests storage URLs with the same bearer plus the existing
  `X-Service-Name: climate-advisor` and `X-Service-Key` headers.
- CityCatalyst rechecks current user access and signs only the exact source or
  result object. Signed URLs authorize one S3 operation; they are not a new
  application-authentication scheme.

| Endpoint                                                                                              | Purpose                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /v1/pdf-ocr/jobs`                                                                               | Create or reuse a conversion; returns `202 Accepted`.             |
| `GET /v1/pdf-ocr/jobs/{source_type}/{source_id}`                                                       | Return status and sanitized failure details.                      |
| `POST /v1/pdf-ocr/jobs/{source_type}/{source_id}/retry`                                                | Explicitly retry a failed or expired conversion.                  |
| `GET /v1/pdf-ocr/jobs/{source_type}/{source_id}/markdown`                                              | Return `text/markdown` after success.                             |
| `POST /api/v1/internal/ca/capabilities/pdf-ocr/{source_type}/{source_id}/source-url`                    | Issue a fresh signed GET URL for the authorized source object.    |
| `POST /api/v1/internal/ca/capabilities/pdf-ocr/{source_type}/{source_id}/result-url`                    | Issue a signed PUT or GET URL for the derived result object.      |
| `POST /api/v1/internal/ca/capabilities/pdf-ocr/{source_type}/{source_id}/result-complete`               | Verify the uploaded object and persist its CC-owned result record. |

The result-URL request contains only `operation` (`put` or `get`) and
`attempt_number`. CityCatalyst derives the exact object key. After a PUT, CA
calls `result-complete`; CityCatalyst checks that exact object in S3 before
storing its key. A GET is issued only for a registered result. No request
accepts a raw S3 key.

The start request carries `source_type`, `source_id`, and the requesting user
ID needed by the existing token-refresh flow. It does not contain PDF bytes,
S3 keys, signed URLs, or business-specific post-processing instructions. Before
accepting a new job, CA uses the current bearer to obtain canonical filename,
size, and content-type metadata from the CityCatalyst source resolver.

Public status values are:

- `queued`
- `running`
- `succeeded`
- `failed`
- `expired`

Status responses include `source_type`, `source_id`, status, timestamps, and a
stable sanitized error when relevant. They do not expose storage keys, signed
URLs, or progress details.

Repeated start requests for the same pair return the existing job. An explicit
retry may requeue a `failed` or `expired` job while the source still exists. If
canonical source metadata differs for an existing pair, CA returns
`409 source_identity_conflict` instead of silently rebinding the job.

## Processing

1. A domain-specific CityCatalyst route verifies access and maps the file to a
   supported `(source_type, source_id)` pair.
2. CA validates the pair through the CityCatalyst resolver, creates or reuses
   the PostgreSQL job, and returns immediately.
3. The in-process dispatcher claims jobs while one of its two slots is free.
4. The task refreshes the existing user-scoped token when needed, obtains a
   fresh signed GET URL from CityCatalyst, and streams the PDF to temporary disk.
5. CA validates the PDF signature, size, page count, encryption, and readability.
6. CA creates ordered page-range chunks under `/tmp/pdf-ocr`.
7. Each active job sends one Mistral request at a time; the process-wide limit is
   two requests.
8. Returned chunk Markdown is written to temporary files and merged in page
   order with clear page separators.
9. CA obtains a signed PUT URL and uploads the final Markdown directly to the
   derived result object.
10. CA calls CityCatalyst to complete the result. CityCatalyst verifies the
    object, stores the result S3 key in the CC database, and confirms completion.
    Only then does CA mark its job `succeeded`.
11. Temporary files are removed in `finally`, including after failure or
    shutdown.

Recommended page separator:

```markdown
<!-- page: 12 -->
```

## Persistence and Recovery

CityCatalyst owns all physical S3 pointers. For inventory sources, the pointer is
the existing `ImportedInventoryFile.s3Key`; Concept Note sources use the CC
stored-file record. CA's `pdf_ocr_jobs` contains one row per
`(source_type, source_id)` and stores:

- source type and source ID
- canonical filename, size, and content type
- immutable creator user ID for audit and the user ID authorized for the current
  attempt
- status, model, page count, and the successful attempt number
- sanitized error code and message
- attempt count
- lease owner, lease expiry, and heartbeat time
- created, started, completed, and updated timestamps

The CA database enforces uniqueness on `(source_type, source_id)`. `source_type`
is text validated by the application registry rather than a PostgreSQL enum.
There are no cross-database foreign keys and no stored S3 keys, bearer tokens, or
signed URLs in CA. Job creation uses an atomic insert-on-conflict so simultaneous
starts cannot create duplicate conversions. A start or retry sets the
current-attempt user only after CityCatalyst validates that user. Workers use
that user with the existing token-refresh flow. This allows an authorized
collaborator to retry a shared source after the creator loses access; neither
stored user ID is authorization by itself.

The CC database stores each verified result in `PdfOcrResult`:

- source type and source ID
- attempt number
- result S3 key
- content type, byte size, and optional S3 ETag
- created and expiry timestamps

Its primary key is `(source_type, source_id, attempt_number)`, and the result S3
key is unique. This table is the authoritative result catalog; CA keeps only the
job and successful attempt number. Result completion is idempotent: repeating it
for the same verified object returns the existing row, while conflicting object
metadata is rejected.

The dispatcher claims rows using PostgreSQL row locking with
`FOR UPDATE SKIP LOCKED`. A running job has a ten-minute lease that is extended
every 60 seconds. If the pod stops, the restarted CA process reclaims expired
leases and restarts the whole conversion attempt.

Chunk files are not durable resume artifacts, and there is no chunk table. This
keeps recovery simple and avoids a persistent volume.

Final Markdown reuses the existing CityCatalyst S3 bucket under a dedicated
result prefix such as:

```text
pdf-ocr/results/{source_type}/{source_id}/{attempt_count}/combined_markdown.md
```

CityCatalyst derives and validates this key from the source pair and attempt.
CA never accepts or stores a caller-selected storage key.

There is no new CA-owned bucket. Development and test reuse
`citycatalyst-files`, while production reuses `citycatalyst-files-prod`. The
CC database stores the source and result pointers, not their contents.

The initial retention period is 14 days and is recorded on the CC result row.
Expired or unexpectedly missing results return `410 Gone` and may be regenerated
while the source PDF still exists.

## New Database Fields

Only the following tables and fields are introduced for PDF OCR and Concept Note
upload integration.

### CityCatalyst Database

`StoredFile`:

```text
source_type
source_id
city_id
uploaded_by_user_id
original_file_name
content_type
size_bytes
s3_key
created
last_updated
```

`PdfOcrResult`:

```text
source_type
source_id
attempt_number
result_s3_key
content_type
size_bytes
etag
created_at
expires_at
```

### Climate Advisor Database

`pdf_ocr_jobs`:

```text
source_type
source_id
source_filename
source_size_bytes
source_content_type
created_by_user_id
attempt_requested_by_user_id
status
model
page_count
attempt_count
queued_at
run_after
started_at
completed_at
lease_owner
lease_expires_at
heartbeat_at
error_code
error_message
created_at
updated_at
```

### Concept Note Builder Database

Workflow and document tables:

`concept_note_runs`:

```text
run_id
thread_id
user_id
city_id
project_id
funder_id
selected_funding_record_id
status
workflow_step
context_summary
permission_summary
trace_id
created_at
updated_at
```

`concept_note_uploads`:

```text
upload_id
run_id
uploaded_by_user_id
source_label
filename
mime_type
size_bytes
created_at
```

`concept_note_upload_processing`:

```text
upload_id
status
attempt_count
error_code
error_message
started_at
completed_at
updated_at
```

`concept_note_context_bundles`:

```text
run_id
context_bundle
created_at
updated_at
```

`concept_note_gaps`:

```text
gap_id
run_id
chapter_id
field_key
severity
reason
status
created_at
```

`concept_note_chapters`:

```text
chapter_id
run_id
template_section_id
title
body_markdown
position
status
required
user_locked
deleted
latest_revision_id
created_at
updated_at
```

`concept_note_chapter_revisions`:

```text
revision_id
chapter_id
revision_number
author_type
change_type
body_markdown
patch_summary
created_at
```

`concept_note_evidence_links`:

```text
evidence_link_id
chapter_id
revision_id
selected_source_label
source_location
claim_ref
quote_or_summary
```

`concept_note_matched_projects`:

```text
match_id
run_id
funding_record_id
decision
fit_rationale
evidence
caveats
```

`concept_note_exports`:

```text
export_id
run_id
file_type
file_ref
status
```

Funding-reference tables:

`funders`:

```text
funder_id
name
funder_type
country
region
profile
```

`funding_records`:

```text
funding_record_id
funder_id
is_opportunity
name
applicant_name
city
state_region
country
category
hazards
interventions
finance_route
instrument_type
region_scope
min_award
max_award
award_amount
currency
award_year
status
summary
```

`is_opportunity = true` identifies programme/application opportunities;
`false` identifies complete funded-project examples. Templates and criteria
reference only opportunity records.

`funder_templates`:

```text
template_id
funding_record_id
template_name
output_format
chapter_schema
required_fields
```

`funder_criteria`:

```text
criterion_id
funding_record_id
criterion_type
label
requirement_text
weight
hard_gate
normalized_rule
```

`source_documents`:

```text
source_document_id
source_type
url
title
license_status
content_hash
fetched_at
```

`funding_record_evidence`:

```text
evidence_id
funding_record_id
source_document_id
claim
quote_or_summary
source_map
```

CA-owned `threads` and `messages` are referenced by CNB where needed but are not
duplicated in the CNB database.

No new fields are required on the existing `ImportedInventoryFile`, CA
`threads`, or CA `messages` tables.

## Configuration

Behavior settings belong in `climate-advisor/llm_config.yaml`:

```yaml
pdf_ocr:
  enabled: true
  model: "mistral-ocr-latest"
  max_file_mb: 20
  max_pages: 500
  chunk_target_mb: 15
  chunk_max_pages: 50
  max_active_jobs: 2
  chunk_concurrency_per_job: 1
  global_mistral_concurrency: 2
  max_job_attempts: 3
  max_chunk_attempts: 3
  lease_duration_seconds: 600
  lease_heartbeat_seconds: 60
  job_timeout_minutes: 10
  mistral_request_timeout_seconds: 180
  source_download_timeout_seconds: 120
```

`MISTRAL_API_KEY` remains in the CA runtime environment. OCR reuses the existing
`CC_SERVICE_API_KEY`/`CC_API_KEY` secret and user-scoped JWT flow; it adds no auth
secret. S3 credentials stay with CityCatalyst. CA accesses only the exact source
or result object authorized by each short-lived signed URL.

Result retention belongs to the CityCatalyst result record and S3 lifecycle
configuration, not to CA's model/worker configuration.

## Failures and Retries

Retry individual Mistral requests for `429`, transient `5xx`, timeouts, and
connection resets, using exponential backoff with jitter and `Retry-After` when
available.

Retry transient signed-URL, result-upload, and result-registration failures. If
the upload succeeded but the response was lost, the idempotent CC completion
call recovers the existing result instead of running OCR again.

Do not retry invalid, encrypted, corrupt, oversized, over-page-limit, or
unsupported PDFs. Provider authentication failure is an operator alert, not a
document retry.

The overall 10-minute timeout includes download, validation, OCR, merge, and
result upload. User-facing responses use stable codes such as:

- `file_too_large`
- `too_many_pages`
- `encrypted_pdf`
- `corrupt_pdf`
- `source_unavailable`
- `ocr_provider_rate_limited`
- `ocr_provider_failed`
- `job_timeout`
- `result_missing`
- `result_registration_failed`

Raw provider messages are kept out of API responses.

## Concurrency and Kubernetes

The MVP requires:

- one existing CA pod
- one Uvicorn process
- two active PDF jobs
- one active Mistral request per job
- two Mistral requests globally

All source types share the same FIFO queue and two execution slots; source type
does not change priority or conversion behavior. If five PDFs arrive together,
two run and three stay queued. Completing either running job frees a slot for
the next queued job.

No new Kubernetes workload, persistent volume, or S3 secret is needed. The
existing CA Deployment needs the OCR secret/configuration, sufficient resources,
and shutdown grace.

Initial resource target:

```text
cpu request: 500m
memory request: 1Gi
ephemeral storage request: 2Gi
terminationGracePeriodSeconds: 240
```

On `SIGTERM`, CA stops claiming jobs, finishes only work that fits within the
remaining grace period, releases unfinished leases, and deletes temporary files.

Two concurrent 20 MB PDFs must be benchmarked against CA chat/API latency and
memory use before production enablement. Do not increase concurrency or CA
replicas before implementing a distributed limiter.

## Security and Observability

- Do not log service tokens, signed URLs, raw PDFs, full Markdown, storage keys,
  or raw provider responses.
- Logs may include source type/ID, status transitions, durations, page and chunk
  counts, attempt numbers, and sanitized error codes.
- Metrics should cover queue depth/age, active jobs, duration, failures, retries,
  Mistral `429`s, lease recovery, and missing results.
- A `succeeded` state must always correspond to a readable Markdown artifact.

## `PDF_converter` Reuse Boundary

Reuse the useful stage-one concepts from
`Open-Earth-Foundation/PDF_converter`:

- Mistral OCR client behavior
- page or page-range OCR
- bounded provider concurrency
- deterministic page-order merging
- clear page separators

Do not copy its CLI assumptions, permanent local-output contract, vision agents,
structured extraction, mapping, database loading, or storage/retry behavior that
bypasses CA's job state.
