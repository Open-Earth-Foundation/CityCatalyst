# How modules interact with the ingest spine

Companion to [GenericFileIngestionArchitecture.md](./GenericFileIngestionArchitecture.md).

The spine is the shared document pool (`IngestDocument`) and the catalog (`NativeInputCatalog`). Modules do not share a system of record. Each module enters through its own door, and Core publishes catalog rows at two moments:

- **Path B** when the file bytes are durable. One row for the file.
- **Path A** when that module commits its own rows. One row per committing module.

```mermaid
flowchart LR
  subgraph doors [Module doors]
    cnbDoor["Concept-note upload"]
    ghgiDoor["GHGI runner"]
    fromDoc["From existing document"]
    ccraDoor["CRVA plugin"]
  end

  subgraph spine [Ingest spine]
    pool["IngestDocument<br/>bytes, hash, visibility"]
    pathB["Path B catalog row"]
    runner["Stage runner<br/>IngestJob / IngestItem"]
    pathA["Path A catalog row"]
  end

  subgraph records [What stays outside the pool]
    ca["Climate Advisor<br/>upload id and chapters"]
    inventory["InventoryValue"]
    review["Review draft only"]
  end

  cnbDoor --> pool
  pool --> pathB
  ghgiDoor --> runner
  fromDoc --> runner
  ccraDoor --> runner
  runner --> pool
  runner --> pathA
  pathB --> ca
  pathA --> inventory
  runner --> review
```

Visibility on the pool row is `city`, `run`, `org`, or `project`. A concept-note working file is `run` until `POST /api/v1/ingest/documents/{id}/promote` sets it to `city`.

## Concept notes

Concept notes do not enter the runner. `POST /api/v1/concept-notes/{runId}/uploads` writes the pool after Climate Advisor has accepted the upload id.

```mermaid
sequenceDiagram
  actor User
  participant CC as CityCatalyst upload route
  participant CA as Climate Advisor
  participant Pool as IngestDocument
  participant Cat as NativeInputCatalog

  User->>CC: POST /concept-notes/{runId}/uploads
  CC->>CA: Create upload
  CA-->>CC: upload_id accepted
  CC->>CC: Store PDF bytes in S3
  CC->>Pool: store bytes, visibility run
  CC->>Cat: Path B kind cnb_upload
  Note over Cat: sourceId is the CA upload_id<br/>owningModule cnb
  CC->>CA: OCR or markdown handoff
  Note over Pool,CA: Chapter text stays in Climate Advisor.<br/>No Path A row.
```

A later upload can reuse a city-visible pool row with the same content hash and scope. Run-private origins are deduplicated within their actual uploader's immutable `privateOwnerId`, so identical private uploads by different actors retain independent filenames, sharing and withdrawal. The origin key stays unchanged on city promotion; separately published private origins remain distinct, while new public uploads can reuse either authorized city document. The upload association records the current authorized actor, independently of the pooled file's audit author. An upload replay retains its active existing document link. `catalogId` on the pool row is set only when empty, so another upload does not replace its primary link.

Migration `20261115150000-isolate-private-ingest-documents.cjs` backfills existing run-private origins from their uploader and extends the active hash/scope unique index with `private_owner_id`, retaining PostgreSQL `NULLS NOT DISTINCT` for public origins. Apply it before deploying code that reads the new field. Downgrade refuses transactionally if restoring the previous uniqueness would merge independent active origins; it never deletes source rows to force rollback.

Upload creation and status responses expose the stable `documentId` and current `visibility`, so an authorized author or administrator can explicitly share a working attachment through the existing promote endpoint. Sharing retains the pool identity and file bytes.

`markdownReady` starts false for PDFs and becomes true only after the leased OCR result and its immutable artifacts are persisted successfully. Successful delivery also repairs the flag when OCR completed before the upload's Path B association was registered. Native Markdown enters the existing artifact pipeline directly.

Artifact reads and source-availability checks enforce lifecycle, digest, scope and current city access for every catalog-backed CNB source, including original uploads whose catalog labels have no reuse `runId`. A run-private original remains available only to its original actor; reused sources also require an authorized target upload and city-visible original. Withdrawal, supersession or byte purge blocks later consumption in either path. Only uploads with no catalog association retain the legacy read path; deleting an original note's processing artifacts also makes availability fail when its OCR job is gone.

## Greenhouse gas inventory

`GhgiIngestPlugin` is the registered runner plugin (`createIngestPlugin("ghgi")`). It accepts eCRF and near-eCRF, commits through `InventoryImportService.importECRFData`, and tags new `InventoryValue` rows with `sourceDocumentId`. Core then publishes Path A `ingest_extract`.

Wizard eCRF and near-eCRF approval, and Chile bulk, commit through `ingestGhgiBuffer`. The `/import` upload still stores `ImportedInventoryFile` and waits for approval. A PDF stores Path B, then the GHGI plugin rejects it as an unknown format.

```mermaid
sequenceDiagram
  actor Caller
  participant Runner as Ingest runner
  participant Pool as IngestDocument
  participant Cat as NativeInputCatalog
  participant Plugin as GhgiIngestPlugin
  participant SoT as InventoryValue

  Caller->>Runner: Enqueue ghgi item
  Runner->>Pool: Store bytes
  Runner->>Cat: Path B kind ingest_document
  Runner->>Plugin: detect, adapt, validate
  alt eCRF or near-eCRF and validation is clean
    Plugin->>SoT: importECRFData
    Runner->>Cat: Path A kind ingest_extract
  else other format
    Plugin-->>Runner: reject
    Note over Pool,Cat: Path B remains. No inventory rows.
  end
```

## Climate risk

`CcraIngestPlugin` implements the plugin contract for a CRVA PDF. `approvalPolicy` is `review`. `commit` throws because there is no CRVA system of record. `createIngestPlugin` does not return this plugin, so a runner job cannot select `ccra` yet.

```mermaid
flowchart TD
  pdf["CRVA PDF"] --> detect["detect: PDF only, 20 MiB"]
  detect --> draft["parse and adapt to a review draft"]
  draft --> hold["awaiting_review"]
  hold --> stop["commit throws"]
  stop --> none["No Path A row"]
```

## Second module, same file

`POST /api/v1/modules/{module}/ingest/from-document/{documentId}` does not upload bytes again and does not publish another Path B row. The runner starts at coarse detect. The committing module adds its own Path A row.

```mermaid
flowchart TD
  doc["Existing IngestDocument"] --> vis{Visibility}
  vis -->|run| refuse["Refused until promote"]
  vis -->|city, org, or project| reuse["from-document"]
  reuse --> detect["Coarse detect, then the module plugin"]
  detect --> commit["Module commit"]
  commit --> pathA["New Path A row<br/>same content hash"]
  pathB["Original Path B row"] --- doc
```

Withdraw keeps the catalog row and the imported values. `DELETE` with `{ "deleteImportedData": true }` also removes inventory rows tagged with that document. A `run` attachment is not offered to another module until promote.

## Where each module stops

```mermaid
flowchart LR
  s1["1 Receive"] --> s2["2 Store"]
  s2 --> s3["3 Path B"]
  s3 --> s4["4 Detect"]
  s4 --> s5["5 Adapt"]
  s5 --> s6["6 Validate"]
  s6 --> s7["7 Decide"]
  s7 --> s8["8 Commit SoT"]
  s8 --> s9["9 Path A"]

  cnbStop["Concept notes stop at 3"] -.-> s3
  crvaStop["Climate risk stops at 7"] -.-> s7
  ghgiStop["GHGI eCRF can reach 9"] -.-> s9
```

HIAP and MEED catalog rows (`hiap_ranking`, `hiap_meed_artifact`, and the related kinds) are lookup pointers. They are not files in this pool and they do not use the runner.
