# Implementation checklists: AI-assisted upload

**Scope:** (1) Universal LLM wrapper, (2) Path C (PDF → AI extraction).  
**Order:** Complete Checklist 1 (wrapper) first; then Checklist 2 (Path C).  
Approve these checklists before implementation.

---

## Checklist 1: Universal LLM wrapper

A single wrapper used across the app (Path C extraction, future Path B interpretation, and any other LLM use) that supports any provider, model, and config.

### 1.1 Design & contract

- [ ] **Interface:** Define a minimal provider-agnostic interface (e.g. `complete(options: { messages, model?, temperature?, maxTokens?, ... }) => Promise<{ content: string, usage?, raw? }>`). All callers use this; no provider-specific types in app code.
- [ ] **Config shape:** Define a config type (e.g. provider id, model, apiKey, baseURL?, timeout?, maxRetries?). Config loaded from env (e.g. `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`) with optional overrides per call.
- [ ] **Structured output:** Document how the wrapper supports “return JSON” (e.g. response_format / schema hint in options, or post-parse in caller). No requirement to implement tool-calling in v1.
- [ ] **Errors:** Normalize errors (timeout, rate limit, auth, provider error) into a small set of app-level error types/codes so callers can handle without branching on provider.

### 1.2 Implementation

- [ ] **Module location:** Add wrapper under e.g. `src/backend/llm/` or `src/services/llm/` (single entry point, e.g. `LLMService` or `createLLMClient`).
- [ ] **Provider adapters:** Implement at least one adapter (e.g. OpenAI) that fulfils the interface. Structure so adding a second provider (e.g. Anthropic) is a new adapter file + config branch, no changes to callers.
- [ ] **Config loading:** Read provider, model, apiKey (and optional baseURL, timeout) from env; validate required keys at startup or first use; no hardcoded keys.
- [ ] **Invocation:** Single method (e.g. `complete`) that takes messages (array of `{ role, content }`), optional model/temperature/maxTokens overrides, and returns `{ content: string, usage?, raw? }`.
- [ ] **Timeouts & retries:** Apply timeout (e.g. 60s) and optional retries (e.g. 1–2) inside the wrapper; expose timeout as config.
- [ ] **Logging:** Log at debug level: provider, model, token usage if available; never log full message content or API keys.
- [ ] **Tests:** Unit tests for the wrapper (mock HTTP/adapter): success response, timeout, and at least one error type (e.g. 401) normalized to app error.

### 1.3 Integration

- [ ] **Scope:** Implement the wrapper for the scope of this work only (Path C extraction, future Path B interpretation). Do not migrate existing OpenAI usage (`translate.ts`, assistant routes, `openai.ts`); they remain as-is. Wrapper and direct OpenAI coexist (same or separate env keys as needed).
- [ ] **Docs:** Short README or comment in the wrapper module: purpose, config env vars, example usage, how to add a new provider.

---

## Checklist 2: Path C (PDF → AI extraction)

Path C: user uploads PDF → status `PENDING_AI_EXTRACTION` → user clicks “Extract with AI” → backend extracts document content, calls LLM, normalizes rows → status `WAITING_FOR_APPROVAL` → same Steps 2–4 and approve flow as today.

### 2.1 Schema & model

- [ ] **file_type:** Extend `ImportedInventoryFile.fileType` to include `pdf` (DB enum + TypeScript types). Migration: add `'pdf'` to existing `file_type` enum.
- [ ] **import_status:** Add `PENDING_AI_EXTRACTION` to `ImportStatusEnum` and DB enum. (Optional for Path C: add `PENDING_AI_INTERPRETATION` for Path B later.)
- [ ] **Model & types:** Update `ImportedInventoryFile` (and any DTOs) so `fileType` is `"xlsx" | "csv" | "pdf"` and `importStatus` includes the new value(s). Update `util/types.ts` / `ImportStatusResponse` if they reference these.

### 2.2 Upload flow (Path C entry)

- [ ] **Validation:** Extend `FileValidatorService` (or upload handler) to accept PDF: type check (e.g. `application/pdf`), size limit, optional page limit. Reject non-PDF when Path C is the only PDF path.
- [ ] **Upload API:** When file is PDF: create `ImportedInventoryFile` with `fileType: "pdf"`, `importStatus: PENDING_AI_EXTRACTION`, store file buffer in `data`. Return 200 with `importedFileId` and status. No eCRF/column detection for PDF.
- [ ] **Frontend – upload:** Allow PDF in the GHGI import upload step (accept `application/pdf` or `.pdf`). After upload, show state “PDF ready for extraction” and a single CTA: **“Extract with AI”** (no “Continue” for PDF).

### 2.3 PDF → document content

- [ ] **Strategy:** Choose approach: (A) send PDF bytes to a document-capable model if the provider supports it, or (B) PDF-to-text (and optionally table extraction) then send text to the LLM. Document the choice and any size/page limits.
- [ ] **Implementation:** Implement PDF-to-content step (library or provider API): input = stored buffer, output = string (or structured text/tables) for the extraction prompt. If using a separate library (e.g. pdf-parse), add dependency and error handling (corrupt PDF, password-protected).
- [ ] **Limits:** Enforce max pages or max size before extraction to avoid timeouts; return clear error if exceeded.

### 2.4 Extraction service (uses LLM wrapper)

- [ ] **Input/output:** Extraction service (e.g. `InventoryExtractionService` or under `backend/`) accepts: document content (string), target schema (list of field names: sector, subsector, totalCO2e, co2, ch4, n2o, year, etc.). Returns: array of plain objects (one per inventory row), keys matching schema; missing values as null.
- [ ] **Prompt:** Use the universal LLM wrapper. System prompt: role (extract GHG inventory line items), output format (JSON array of objects), schema. User message: document content (truncated if needed). No PII in prompts.
- [ ] **Parsing:** Parse LLM response as JSON array; validate shape (array of objects, allowlisted keys); normalize to a single row interface (e.g. `ExtractedRow`). On parse failure, throw or return structured error for API to return 502.
- [ ] **Config:** Use same LLM config as wrapper (provider, model from env). No extraction-specific env except optional max input length.

### 2.5 Extract API

- [ ] **Route:** `POST /api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/extract` (or equivalent). Auth: same as existing import APIs (user, city, inventory context).
- [ ] **Logic:** Load `ImportedInventoryFile` by id; verify `importStatus === PENDING_AI_EXTRACTION` and `fileType === "pdf"`. Read PDF buffer from `data`. Run PDF-to-content, then extraction service. Normalize each extracted row to app row shape (GPC resolver, sector/subsector/scope IDs as needed for `importECRFData`). Store normalized rows in `mappingConfiguration.rows` (or agreed field). Set `importStatus = WAITING_FOR_APPROVAL`, persist.
- [ ] **Response:** Return updated import status and optionally row count. 404 if file not found or wrong status; 400 if not PDF; 502 on extraction/LLM/PDF errors.
- [ ] **Idempotency:** Re-running extract overwrites previous extraction (same as “Re-extract”); no need to block duplicate calls.

### 2.6 Frontend – Extract with AI and Steps 2–4

- [ ] **Extract with AI:** Button visible when status is `PENDING_AI_EXTRACTION`. On click: call Extract API; show loading; on success, refetch import status and advance to Steps 2–4. On 502, show error and allow retry.
- [ ] **Steps 2–3 for Path C:** For PDF-origin imports, show extracted rows in an editable table (add/remove/edit cells) instead of column mapping. Reuse or extend existing review step to support “rows” view. Optional: “Re-extract” button that calls Extract API again and replaces rows.
- [ ] **Step 4 – Approve:** Same approve button and flow. Backend approve handler must support Path C: when `fileType === "pdf"`, use stored `mappingConfiguration.rows` (normalized) and call `importECRFData` with those rows instead of re-parsing a spreadsheet.

### 2.7 Approve flow (Path C)

- [ ] **Approve API:** In approve route, if `fileType === "pdf"` and `mappingConfiguration.rows` exists: skip file re-parse and column detection; run any remaining normalization (e.g. resolve GPC/sector IDs if not already done at extract time) and call `importECRFData` with the stored rows. If `fileType` is xlsx/csv, keep current behaviour (re-parse, processECRFFile, importECRFData).
- [ ] **Status transitions:** Same as today: WAITING_FOR_APPROVAL → APPROVED → IMPORTING → COMPLETED or FAILED. Error handling and rollback consistent with existing import.

### 2.8 Testing & docs

- [ ] **Tests:** API test for Extract: mock LLM wrapper (or PDF + LLM); assert status transition and rows stored. Approve test for Path C: approve with stored rows, assert import completes (or mocked importECRFData).
- [ ] **Docs:** Update architecture/implementation doc to state Path C implemented; list Extract API and any new env vars. Optional: add “How to test Path C” (sample PDF, expected outcome).

---

## Implementation status (Path C)

Path C is implemented end-to-end:

- **Extract API:** `POST /api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/extract`. Requires PDF file in `PENDING_AI_EXTRACTION`; runs PDF-to-text and LLM extraction; stores rows in `mappingConfiguration.rows`, sets status to `WAITING_FOR_APPROVAL`. Returns 400 when not PDF/wrong status, 502 on LLM/PDF errors.
- **Frontend:** "Extract with AI" button on step 0 calls the Extract API; on success refetches status and advances. PDF imports skip to step 4 (review) and use stored rows for summary; approve uses the same Import button.
- **Approve:** When `fileType === "pdf"` and `mappingConfiguration.rows` exists, approve skips file parse; converts extracted rows to ECRF shape (GPC resolver + `ECRFImportService.lookupGPCReference`), then `importECRFData`. xlsx/csv flow unchanged.
- **Sector/subsector when gpcRefNo absent:** PDF/LLM naming variants (e.g. "Buildings", "Road: Passenger", "Solid Waste") are normalized via `util/GHGI/data/gpc-name-mappings.json` and `resolveGpcRefNo` / `normalizeSectorAndSubsector` in `gpc-ref-resolver.ts`, so rows without `gpcRefNo` can still resolve to the correct GPC reference.
- **Extraction shaping:** The LLM extraction prompt (`InventoryExtractionService`) includes: (1) the GPC taxonomy as a sector–subsector hierarchy (each sector with its valid subsectors) so (sector, subsector) pairs stay valid; (2) a dictionary of possible report terms → canonical sector or subsector (from `gpc-name-mappings.json`) to improve mapping accuracy; (3) instruction to output `gpcRefNo` when the document shows a GPC code. After parsing, any row still missing `gpcRefNo` is filled via `resolveGpcRefNo(sector, subsector, category)`.
- **Env (LLM):** Same as universal wrapper: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, optional `LLM_BASE_URL`, `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`.

---

## Approval

- [ ] **Checklist 1 (Universal LLM wrapper)** approved  
- [ ] **Checklist 2 (Path C)** approved  

After approval, implementation can proceed in order: Checklist 1 → Checklist 2.
