import { describe, expect, it } from "@jest/globals";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { GhgiIngestPlugin } from "@/backend/ingest/plugins/GhgiIngestPlugin";
import {
  bulkErrorFromIngestItem,
  ingestGhgiBuffer,
  shouldCommitViaGhgiRunner,
} from "@/backend/ingest/ghgi-run";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import type { ValidationResult } from "@/backend/FileValidatorService";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const INVENTORY_ID = "a3e1c0a0-1111-4b11-8c11-aaaaaaaaaaaa";
const USER_A = "11111111-1111-1111-1111-111111111111";

function ecrfValidation(): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings: [],
    fileType: "xlsx",
    detectedColumns: { gpcRefNo: 0, sector: 1, subsector: 2, scope: 3 },
  };
}

function ecrfResult(totalCO2e: number): ECRFImportResult {
  return {
    rows: [
      {
        gpcRefNo: "I.1.1",
        sectorId: "s",
        subsectorId: "ss",
        subcategoryId: null,
        scopeId: "1",
        totalCO2e,
        rowIndex: 0,
      },
    ],
    errors: [],
    warnings: [],
    rowCount: 1,
    validRowCount: 1,
  };
}

describe("GHGI runner cutover helpers (CC-1218)", () => {
  it("sends deterministic eCRF/near-eCRF/CIRIS through the runner, not PDF", () => {
    expect(
      shouldCommitViaGhgiRunner({
        fileType: "csv",
        validationResults: { processingResults: { rowCount: 1 } },
      }),
    ).toBe(true);
    expect(
      shouldCommitViaGhgiRunner({
        fileType: "xlsx",
        validationResults: { adapterType: "near-ecrf" },
      }),
    ).toBe(true);
    expect(
      shouldCommitViaGhgiRunner({
        fileType: "pdf",
        validationResults: { processingResults: { rowCount: 1 } },
      }),
    ).toBe(false);
    expect(
      shouldCommitViaGhgiRunner({
        fileType: "xlsx",
        validationResults: { isCIRIS: true },
      }),
    ).toBe(true);
  });

  it("auto-commits signed CO2e eCRF through GhgiIngestPlugin", async () => {
    const imported: number[] = [];
    const plugin = new GhgiIngestPlugin({
      validateStructure: async () => ecrfValidation(),
      buildImportResult: async () => ecrfResult(-12.5),
      importEcrf: async (_inventoryId, importResult) => {
        imported.push(importResult.rows[0]?.totalCO2e ?? 0);
        return {
          totalRows: 1,
          importedRows: 1,
          skippedRows: 0,
          errors: [],
          warnings: [],
        };
      },
    });
    const store = new MemoryIngestStore();
    const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
    const { item } = await ingestGhgiBuffer({
      buffer: Buffer.from("ecrf"),
      originalFileName: "city.xlsx",
      cityId: CITY_ID,
      inventoryId: INVENTORY_ID,
      userId: USER_A,
      runner,
      store,
      plugin,
    });
    expect(item.status).toBe("completed");
    expect(imported).toEqual([-12.5]);
    expect(item.stage).not.toBe("map");
  });

  it("registers Path B for a GHGI PDF and does not commit rows", async () => {
    const imported: string[] = [];
    const plugin = new GhgiIngestPlugin({
      importEcrf: async () => {
        imported.push("commit");
        return {
          totalRows: 0,
          importedRows: 0,
          skippedRows: 0,
          errors: [],
          warnings: [],
        };
      },
    });
    const store = new MemoryIngestStore();
    const documentPool = new MemoryIngestDocumentPool();
    const runner = new IngestRunner(store, documentPool);
    const { item } = await ingestGhgiBuffer({
      buffer: Buffer.from("%PDF-1.4"),
      originalFileName: "inventory.pdf",
      cityId: CITY_ID,
      inventoryId: INVENTORY_ID,
      userId: USER_A,
      runner,
      store,
      plugin,
    });
    expect(item.status).toBe("failed");
    expect(item.errorCode).toBe("unsupported_extension");
    expect(item.documentId).toBeTruthy();
    expect(documentPool.documents.size).toBe(1);
    expect(imported).toEqual([]);
  });

  it("maps plugin unknown_format not_ecrf to bulk not_ecrf", async () => {
    const plugin = new GhgiIngestPlugin({
      validateStructure: async () => ({
        isValid: true,
        errors: [],
        warnings: [],
        fileType: "xlsx",
        isBIOMATEC: true,
      }),
      importEcrf: async () => {
        throw new Error("commit should not run");
      },
    });
    const store = new MemoryIngestStore();
    const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
    const { item } = await ingestGhgiBuffer({
      buffer: Buffer.from("biomatec"),
      originalFileName: "biomatec.xlsx",
      cityId: CITY_ID,
      inventoryId: INVENTORY_ID,
      userId: USER_A,
      runner,
      store,
      plugin,
    });
    expect(item.status).toBe("failed");
    expect(bulkErrorFromIngestItem(item).code).toBe("not_ecrf");
  });
});
