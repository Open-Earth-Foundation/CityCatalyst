import { describe, expect, it, jest } from "@jest/globals";
import JSZip from "jszip";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import type { ValidationResult } from "@/backend/FileValidatorService";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { GhgiIngestPlugin } from "@/backend/ingest/plugins/GhgiIngestPlugin";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const INVENTORY_ID = "a3e1c0a0-1111-4b11-8c11-aaaaaaaaaaaa";

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

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) {
    zip.file(name, body);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("GhgiIngestPlugin (CC-991)", () => {
  it("auto-imports eCRF/near-eCRF including signed negative CO2e and never calls OpenAI", async () => {
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
    const ingest = new IngestRunner(store);
    const buffer = await zipOf({
      "city.xlsx": "ecrf",
      "city-2.csv": "near",
    });
    const job = await ingest.enqueue({
      moduleId: "ghgi",
      scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
      files: [{ name: "bundle.zip", buffer }],
    });
    const finished = await ingest.run(job.id, plugin);
    const items = await store.listItems(job.id);

    expect(finished.status).toBe("completed");
    expect(finished.completedCount).toBe(2);
    expect(imported).toEqual([-12.5, -12.5]);
    expect(items.every((item) => item.result?.kind === "ecrf")).toBe(true);
  });

  it("rejects CIRIS/PDF before reaching commit", async () => {
    const validateStructure = jest.fn(async () => ({
      isValid: true,
      errors: [],
      warnings: [],
      fileType: "xlsx" as const,
      isCIRIS: true,
    }));
    const plugin = new GhgiIngestPlugin({
      validateStructure,
      importEcrf: async () => {
        throw new Error("commit should not run");
      },
    });
    const store = new MemoryIngestStore();
    const ingest = new IngestRunner(store);

    const cirisJob = await ingest.enqueue({
      moduleId: "ghgi",
      scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
      files: [{ name: "ciris.xlsx", buffer: Buffer.from("x") }],
    });
    await ingest.run(cirisJob.id, plugin);
    const [ciris] = await store.listItems(cirisJob.id);
    expect(ciris?.errorCode).toBe("unknown_format");
    expect(ciris?.errorLog).toMatch(/ciris/);

    const pdfJob = await ingest.enqueue({
      moduleId: "ghgi",
      scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
      files: [{ name: "scan.pdf", buffer: Buffer.from("%PDF") }],
    });
    await ingest.run(pdfJob.id, plugin);
    const [pdf] = await store.listItems(pdfJob.id);
    expect(pdf?.errorCode).toBe("unsupported_extension");
  });

  it("writes matcher city and year onto the item", async () => {
    const plugin = new GhgiIngestPlugin({
      cities: [{ cityId: CITY_ID, locode: "CL LPT", name: "La Pintana" }],
      resolveInventoryId: async () => INVENTORY_ID,
      validateStructure: async () => ecrfValidation(),
      buildImportResult: async () => ecrfResult(1),
      importEcrf: async () => ({
        totalRows: 1,
        importedRows: 1,
        skippedRows: 0,
        errors: [],
        warnings: [],
      }),
    });
    const store = new MemoryIngestStore();
    const ingest = new IngestRunner(store);
    const job = await ingest.enqueue({
      moduleId: "ghgi",
      scope: { projectId: "11111111-1111-1111-1111-111111111111" },
      files: [
        {
          name: "CL-LPT-2022.csv",
          buffer: Buffer.from("rows"),
        },
      ],
    });
    await ingest.run(job.id, plugin);
    const [item] = await store.listItems(job.id);
    expect(item?.status).toBe("completed");
    expect(item?.targetCityId).toBe(CITY_ID);
    expect(item?.targetInventoryId).toBe(INVENTORY_ID);
    expect(item?.coverageYears).toEqual([2022]);
  });
});
