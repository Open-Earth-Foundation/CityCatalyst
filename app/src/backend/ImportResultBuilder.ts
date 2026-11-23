import ECRFImportService, {
  markParentSuperseded,
  supersedeParentsWithChildren,
  type ECRFImportResult,
} from "@/backend/ECRFImportService";
import { supersedeParentRows } from "@/backend/import/parent-child-rows";
import { isUnsplitSubsectorRef } from "@/util/GHGI/reported-totals";
import { resolveImportedTotalCO2e } from "@/backend/InventoryImportService";
import FileParserService from "@/backend/FileParserService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { ImportedInventoryFile } from "@/models/ImportedInventoryFile";
import { db } from "@/models";
import { scopeFromLabel, taxonomyScope } from "@/util/GHGI/gpc-ref-resolver";
import { findReviewRows, reviewIssue } from "@/backend/ImportRowPreviewService";
import { createHash } from "node:crypto";

function reviewToken(fileId: string, rowIndex: number, source: string): string {
  return createHash("sha256")
    .update(JSON.stringify([fileId, rowIndex, source]))
    .digest("hex");
}

export interface ImportValidationResults {
  adapterType?: string;
  detectedColumns?: Record<string, number>;
  headerKey?: string;
}

export interface BuiltImportResult {
  importResult: ECRFImportResult;
  /** Stored pre-extracted rows (PDF, AI-reshaped or near-eCRF) when they were the source. */
  extractedRows: ExtractedRow[] | null;
}

/** Applies only decisions bound to the original row, after parsing. */
export async function applyReviewedRows(
  result: ECRFImportResult,
  decisions: Record<string, unknown> | undefined,
  fileId: string,
): Promise<void> {
  if (!decisions) return;
  const reviewableRows = new Set(
    findReviewRows(result).map((row) => row.rowIndex),
  );
  for (const row of result.rows) {
    if (!reviewableRows.has(row.rowIndex)) continue;
    const raw = decisions[String(row.rowIndex)];
    if (!raw || typeof raw !== "object" || !row.review) continue;
    const decision = raw as Record<string, unknown>;
    if (!fileId || decision.decisionFileId !== fileId) continue;
    if (
      !row.review.decisionToken ||
      decision.decisionToken !== row.review.decisionToken
    )
      continue;
    const review = row.review;
    const heldExcluded = reviewIssue(row) === "excluded-reference-unconfirmed";
    const originalRef = review.suggestedRefNo ?? row.gpcRefNo;
    if (
      decision.decisionRef !== originalRef ||
      (decision.decisionScope ?? null) !== (review.scope ?? null) ||
      (decision.decisionValue ?? null) !== (row.totalCO2e ?? null)
    )
      continue;
    if (decision.reviewDecision === "skip") {
      row.issue = "skipped-in-review";
      row.errors = ["Skipped in the import review"];
      review.decision = "skip";
      continue;
    }
    const askedTotal = reviewIssue(row) === "gpc-subsector-scope-combined";
    if (
      !["keep", "reclassify", "correct-scope"].includes(
        String(decision.reviewDecision),
      ) &&
      // Only the total-at-risk question offers "leave out" and "not sure".
      !(
        askedTotal &&
        ["omit", "unsure"].includes(String(decision.reviewDecision))
      )
    )
      continue;
    const chosenRef =
      decision.reviewDecision === "reclassify" &&
      typeof decision.gpcRefNo === "string"
        ? decision.gpcRefNo.trim()
        : originalRef;
    const chosenScope =
      decision.reviewDecision === "correct-scope" &&
      typeof decision.scope === "string"
        ? decision.scope
        : review.scope;
    const mapping = await ECRFImportService.lookupGPCReference(chosenRef);
    if (!mapping) continue;
    const catalogueScope = mapping.scopeId
      ? await db.models.Scope.findByPk(mapping.scopeId)
      : null;
    const expected = scopeFromLabel(catalogueScope?.scopeName) ?? null;
    // A held excluded row has no scope conflict to correct, so a reclassify
    // takes the target reference's own scope.
    const normalizedScope =
      heldExcluded && decision.reviewDecision === "reclassify"
        ? null
        : scopeFromLabel(chosenScope);
    const wasConflict =
      (review.catalogueScope !== undefined
        ? review.catalogueScope
        : taxonomyScope(originalRef)) != null &&
      scopeFromLabel(review.scope) != null &&
      (review.catalogueScope !== undefined
        ? review.catalogueScope
        : taxonomyScope(originalRef)) !== scopeFromLabel(review.scope);
    if (
      wasConflict &&
      (expected == null ||
        normalizedScope == null ||
        expected !== normalizedScope)
    )
      continue;
    if (
      expected != null &&
      normalizedScope != null &&
      expected !== normalizedScope
    )
      continue;
    if (decision.reviewDecision === "reclassify" && chosenRef === originalRef)
      continue;
    if (
      decision.reviewDecision === "correct-scope" &&
      normalizedScope === scopeFromLabel(review.scope)
    )
      continue;
    const scope =
      normalizedScope == null
        ? null
        : await db.models.Scope.findOne({
            where: { scopeName: String(normalizedScope) },
          });
    if (normalizedScope != null && !scope) continue;
    row.gpcRefNo = chosenRef;
    row.sectorId = mapping.sectorId;
    row.subsectorId = mapping.subsectorId;
    row.subcategoryId = mapping.subcategoryId;
    row.scopeId = scope?.scopeId ?? mapping.scopeId ?? "";
    review.suggestedRefNo = originalRef;
    review.finalScope =
      normalizedScope == null
        ? (catalogueScope?.scopeName ?? null)
        : String(normalizedScope);
    review.finalCatalogueScope = expected;
    review.decision = decision.reviewDecision as
      "keep" | "reclassify" | "correct-scope" | "omit" | "unsure";
    // "Leave out" stores the value apart from the totals (GPC Box 4.1).
    if (askedTotal) row.omitFromTotal = decision.reviewDecision === "omit";
  }
  // A reclassify can move a child into or out of a subsector (CC-1311).
  supersedeParentsWithChildren(result.rows, result.warnings);
}

/**
 * CC-1311: the parent/child rule of one import, applied against values already
 * on the inventory (manual entry, connected sources, earlier imports). An
 * imported subsector row (`I.3`) is dropped when the inventory has its
 * children. An imported child of a stored `I.3` is only flagged: approve never
 * deletes stored data. Runs after review decisions, which reset earlier marks.
 */
export async function supersedeParentsWithStoredValues(
  result: ECRFImportResult,
  inventoryId: string | null | undefined,
): Promise<void> {
  const live = result.rows.filter(
    (row) => !row.errors?.length && row.subsectorId,
  );
  if (!inventoryId || live.length === 0) return;
  const stored = await db.models.InventoryValue.findAll({
    where: {
      inventoryId,
      subSectorId: [...new Set(live.map((row) => row.subsectorId))],
    },
  });
  // A notation key or a value left out of the total cannot replace a counted value.
  const counted = stored.flatMap((value) =>
    value.co2eq == null || value.unavailableReason || value.omitFromTotal
      ? []
      : [{ value, tonnes: Number(value.co2eq) / 1000 }],
  );

  const parents = live.filter(
    (row) => row.subcategoryId == null && isUnsplitSubsectorRef(row.gpcRefNo),
  );
  const storedChildren = counted.filter(({ value }) => value.subCategoryId);
  for (const { index, ...detail } of supersedeParentRows([
    ...parents.map((row) => ({
      index: result.rows.indexOf(row),
      subsectorId: row.subsectorId,
      subcategoryId: null,
      co2eq: resolveImportedTotalCO2e(row) ?? null,
      notationKey: row.notationKey ?? null,
    })),
    ...storedChildren.map(({ value, tonnes }) => ({
      index: -1,
      subsectorId: value.subSectorId!,
      subcategoryId: value.subCategoryId!,
      co2eq: tonnes,
      notationKey: null,
    })),
  ]))
    markParentSuperseded(result.rows[index], detail, result.warnings);

  const flagged = new Set<string>();
  for (const row of live) {
    if (row.subcategoryId == null || flagged.has(row.subsectorId)) continue;
    const parent = counted.find(
      ({ value }) =>
        value.subSectorId === row.subsectorId &&
        !value.subCategoryId &&
        isUnsplitSubsectorRef(value.gpcReferenceNumber),
    );
    if (!parent) continue;
    flagged.add(row.subsectorId);
    row.storedParent = {
      gpcRefNo: parent.value.gpcReferenceNumber!,
      tonnes: parent.tonnes,
    };
  }
}

// Fields a user may correct per row on PDF/AI-extracted imports.
const ALLOWED_ROW_OVERRIDE_KEYS = new Set([
  "year",
  "sector",
  "subsector",
  "scope",
  "category",
  "totalCO2e",
  "co2",
  "ch4",
  "n2o",
  "gpcRefNo",
  "source",
  "methodology",
  "activityAmount",
  "activityUnit",
  "activityType",
  "activityDataSource",
  "activityDataQuality",
  "reviewDecision",
]);

const REVIEW_DECISIONS = new Set(["keep", "reclassify", "skip"]);

/**
 * Apply user overrides to an extracted row. Only allowed keys are applied;
 * used for manual correction of sector/subsector/category etc. per row.
 */
export function applyRowOverrides(
  base: ExtractedRow,
  overrides: Record<string, unknown>,
  fileId: string,
  token: string,
  catalogueScope?: number | null,
): ExtractedRow {
  if (overrides.reviewDecision != null && overrides.decisionFileId !== fileId)
    return base;
  if (overrides.reviewDecision != null && overrides.decisionToken !== token)
    return base;
  // Legacy PDF overrides predate row review. Do not let them erase the
  // original conflict or disguise a reference edit as a keep decision.
  const baseExpected =
    catalogueScope !== undefined
      ? catalogueScope
      : base.gpcRefNo
        ? taxonomyScope(base.gpcRefNo)
        : undefined;
  const baseScope = scopeFromLabel(base.scope);
  const baseConflict =
    baseExpected != null && baseScope != null && baseExpected !== baseScope;
  if (
    (overrides.reviewDecision === "keep" &&
      overrides.gpcRefNo !== undefined &&
      overrides.gpcRefNo !== base.gpcRefNo) ||
    (baseConflict &&
      (overrides.scope !== undefined ||
        (overrides.gpcRefNo !== undefined &&
          overrides.reviewDecision == null) ||
        (overrides.reviewDecision === "keep" &&
          overrides.gpcRefNo !== undefined &&
          overrides.gpcRefNo !== base.gpcRefNo)))
  ) {
    return base;
  }
  // A decision made on another row or file must not touch this one.
  if (
    overrides.reviewDecision != null &&
    (overrides.decisionRef !== base.gpcRefNo ||
      (overrides.decisionValue ?? null) !== (base.totalCO2e ?? null))
  ) {
    return base;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (!ALLOWED_ROW_OVERRIDE_KEYS.has(key)) continue;
    if (value === null || value === undefined) {
      (out as Record<string, unknown>)[key] = null;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }
    if (typeof value === "string") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  // A decision only counts when it is complete: an unknown value, or a
  // reclassification with no other reference, leaves the row held.
  const reclassified = out.gpcRefNo && out.gpcRefNo !== base.gpcRefNo;
  if (
    !REVIEW_DECISIONS.has(out.reviewDecision ?? "") ||
    (out.reviewDecision === "reclassify" && !reclassified)
  ) {
    out.reviewDecision = null;
  }
  if (reclassified) out.suggestedRefNo = base.gpcRefNo;
  // A user who sets the scope or the reference owns the pair now: the row no
  // longer has a scope inferred from its activity type, and the model's
  // original scope must not come back as the stated scope.
  if (
    base.scopeSource === "inferred" &&
    (out.scope !== base.scope || out.gpcRefNo !== base.gpcRefNo)
  ) {
    out.scopeSource = null;
    out.originalScope = null;
  }
  return out;
}

/**
 * Builds the rows an uploaded file will import, exactly as approval does, so
 * the mapping preview and the real import cannot disagree.
 *
 * mappingOverrides: for xlsx/csv, column name -> field key; for extracted rows,
 * row index (stringified) -> per-row field overrides.
 */
export async function buildImportResult(
  importedFile: ImportedInventoryFile,
  mappingOverrides?: Record<string, unknown>,
): Promise<BuiltImportResult> {
  const mappingConfiguration = (importedFile.mappingConfiguration || {}) as {
    rows?: unknown;
    keyValueShaped?: boolean;
  };
  const validationResults =
    (importedFile.validationResults as ImportValidationResults) || {};
  const adapterType = validationResults.adapterType;
  const namespaced =
    mappingOverrides &&
    ("columnMappings" in mappingOverrides ||
      "rowDecisions" in mappingOverrides);
  const rowDecisions =
    namespaced &&
    mappingOverrides?.rowDecisions &&
    typeof mappingOverrides.rowDecisions === "object"
      ? (mappingOverrides.rowDecisions as Record<string, unknown>)
      : undefined;
  const columnMappings =
    namespaced &&
    mappingOverrides?.columnMappings &&
    typeof mappingOverrides.columnMappings === "object"
      ? (mappingOverrides.columnMappings as Record<string, unknown>)
      : namespaced
        ? undefined
        : mappingOverrides;

  // Pre-extracted rows: PDF, Path B key-value, or Adapter D (near-ecrf) — no file re-parse.
  const storedRows = mappingConfiguration.rows as ExtractedRow[] | undefined;
  const useExtractedRows =
    Array.isArray(storedRows) &&
    storedRows.length > 0 &&
    (importedFile.fileType === "pdf" ||
      mappingConfiguration.keyValueShaped === true ||
      adapterType === "near-ecrf");

  if (useExtractedRows) {
    const legacyBase =
      !namespaced && mappingOverrides
        ? await ECRFImportService.fromExtractedRows(storedRows)
        : null;
    const correctedRows = storedRows.map((row, index) => {
      const rowOverrides = namespaced
        ? undefined
        : mappingOverrides?.[String(index)];
      return rowOverrides && typeof rowOverrides === "object"
        ? applyRowOverrides(
            row,
            rowOverrides as Record<string, unknown>,
            importedFile.id,
            reviewToken(importedFile.id, index, JSON.stringify(row)),
            legacyBase?.rows[index]?.review?.catalogueScope,
          )
        : row;
    });
    let importResult = await ECRFImportService.fromExtractedRows(correctedRows);
    if (legacyBase)
      for (const row of importResult.rows) {
        const original = legacyBase.rows[row.rowIndex]?.review;
        if (row.review && original)
          row.review.catalogueScope = original.catalogueScope;
      }

    // Near-eCRF uploads stored before sector-column extraction was fixed may have
    // no resolvable rows; re-parse from S3/BYTEA using the full eCRF pipeline.
    if (
      adapterType === "near-ecrf" &&
      importResult.validRowCount === 0 &&
      importResult.rowCount > 0
    ) {
      const fileBuffer =
        await InventoryFileStorageService.resolveImportedFileBuffer(
          importedFile,
        );
      if (fileBuffer) {
        const parsedData = await FileParserService.parseFile(
          fileBuffer,
          importedFile.fileType,
        );
        importResult = await ECRFImportService.processECRFFile(parsedData, {
          ...(validationResults.detectedColumns || {}),
        });
      }
    }
    importResult.requiresReferenceReview = true;
    for (const row of importResult.rows) {
      if (row.review)
        row.review.decisionToken = reviewToken(
          importedFile.id,
          row.rowIndex,
          JSON.stringify(storedRows[row.rowIndex]),
        );
    }
    await applyReviewedRows(importResult, rowDecisions, importedFile.id);
    await supersedeParentsWithStoredValues(
      importResult,
      importedFile.inventoryId,
    );
    return { importResult, extractedRows: storedRows };
  }

  // A PDF can only import extracted rows; its bytes are not a table to parse.
  if (importedFile.fileType === "pdf") {
    throw new Error("PDF import has no extracted rows");
  }

  // xlsx/csv (column-mapped, not key-value shaped): parse file and process with ECRF pipeline
  const fileBuffer =
    await InventoryFileStorageService.resolveImportedFileBuffer(importedFile);
  if (!fileBuffer) {
    throw new Error("File data not found");
  }
  const parsedData = await FileParserService.parseFile(
    fileBuffer,
    importedFile.fileType,
  );
  const detectedColumns: Record<string, number> = {
    ...(validationResults.detectedColumns || {}),
  };

  // Apply mapping overrides: columnName -> key; resolve column name to index
  if (
    columnMappings &&
    Object.keys(columnMappings).length > 0 &&
    parsedData.primarySheet
  ) {
    const headers = parsedData.primarySheet.headers;
    for (const [columnName, key] of Object.entries(columnMappings)) {
      if (!key || typeof key !== "string") continue;
      const idx = headers.findIndex((h) => h === columnName);
      if (idx !== -1) {
        detectedColumns[key] = idx;
      }
    }
  }

  const importResult = await ECRFImportService.processECRFFile(
    parsedData,
    detectedColumns,
  );
  const source = createHash("sha256")
    .update(fileBuffer)
    .update(JSON.stringify(detectedColumns))
    .digest("hex");
  for (const row of importResult.rows) {
    if (row.review)
      row.review.decisionToken = reviewToken(
        importedFile.id,
        row.rowIndex,
        source,
      );
  }
  await applyReviewedRows(importResult, rowDecisions, importedFile.id);
  await supersedeParentsWithStoredValues(importResult, importedFile.inventoryId);
  return { importResult, extractedRows: null };
}
