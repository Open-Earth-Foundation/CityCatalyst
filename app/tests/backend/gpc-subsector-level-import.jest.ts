/**
 * CC-1311: subsector-level values (`I.3` with no scope split) on the real
 * catalogue built by the migrations and the GPC seeder.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import ECRFImportService, {
  supersedeParentsWithChildren,
  type ECRFImportResult,
} from "@/backend/ECRFImportService";
import type { ParsedFileData } from "@/backend/FileParserService";
import InventoryImportService from "@/backend/InventoryImportService";
import {
  applyReviewedRows,
  buildImportResult,
} from "@/backend/ImportResultBuilder";
import { POST as approveImport } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route";
import {
  findPendingRows,
  previewImportRows,
} from "@/backend/ImportRowPreviewService";
import {
  getEmissionResults,
  getEmissionsBreakdown,
} from "@/backend/ResultsService";
import { db } from "@/models";
import type { City } from "@/models/City";
import type { User } from "@/models/User";
import {
  GlobalWarmingPotentialTypeEnum,
  ImportStatusEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  teardownTests,
  testUserID,
} from "../helpers";

const PREFIX = "XX_CC1311_";

const row = (gpcRefNo: string, totalCO2e: number, omitFromTotal?: boolean) => ({
  year: 2022,
  sector: null,
  subsector: null,
  category: null,
  gpcRefNo,
  totalCO2e,
  ...(omitFromTotal ? { omitFromTotal } : {}),
});

describe("subsector-level GPC references", () => {
  let city: City;
  let user: User;
  const inventoryIds: string[] = [];

  async function importRows(rows: ReturnType<typeof row>[]) {
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2022,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    inventoryIds.push(inventory.inventoryId);
    const extracted = await ECRFImportService.fromExtractedRows(rows);
    const summary = await InventoryImportService.importECRFData(
      inventory.inventoryId,
      extracted,
      user.userId,
    );
    return { inventoryId: inventory.inventoryId, extracted, summary };
  }

  const stored = (inventoryId: string) =>
    db.models.InventoryValue.findAll({ where: { inventoryId } });

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();
    city = await db.models.City.create({
      cityId: randomUUID(),
      name: `${PREFIX}city`,
      locode: `${PREFIX}${randomUUID().slice(0, 8)}`,
    });
    user = await db.models.User.create({
      userId: randomUUID(),
      name: `${PREFIX}user`,
    });
  });

  afterAll(async () => {
    teardownTests();
    await db.models.NativeInputCatalog.destroy({
      where: { sourceId: inventoryIds },
    });
    await db.models.ImportedInventoryFile.destroy({
      where: { inventoryId: inventoryIds },
    });
    await db.models.Version.destroy({ where: { inventoryId: inventoryIds } });
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventoryIds },
    });
    await db.models.Inventory.destroy({ where: { inventoryId: inventoryIds } });
    await user?.destroy();
    await city?.destroy();
    if (db.sequelize) await db.sequelize.close();
  });

  it("resolves a sector I-III subsector reference with no scope", async () => {
    for (const ref of ["I.3", "II.1", "III.1"]) {
      const mapping = await ECRFImportService.lookupGPCReference(ref);
      expect(mapping).not.toBeNull();
      expect(mapping!.subcategoryId).toBeNull();
      expect(mapping!.scopeId).toBeNull();
    }
  });

  it("keeps the subsector scope for sectors IV-V", async () => {
    for (const ref of ["IV.1", "V.1"]) {
      const mapping = await ECRFImportService.lookupGPCReference(ref);
      expect(mapping).not.toBeNull();
      expect(typeof mapping!.scopeId).toBe("string");
      expect(mapping!.scopeId).not.toBe("");
    }
  });

  it("still rejects a reference that is not in the taxonomy", async () => {
    expect(await ECRFImportService.lookupGPCReference("I.9")).toBeNull();
  });

  it("approve stores a subsector-level value", async () => {
    const { inventoryId, summary } = await importRows([row("I.3", 500)]);
    expect(summary.errors).toEqual([]);
    const values = await stored(inventoryId);
    expect(values).toHaveLength(1);
    expect(values[0].gpcReferenceNumber).toBe("I.3");
    expect(values[0].subSectorId).toBeTruthy();
    expect(values[0].subCategoryId).toBeNull();
    expect(BigInt(values[0].co2eq as unknown as string)).toBe(500_000n);
  });

  it("stores only the children when parent and children come together", async () => {
    const { inventoryId } = await importRows([
      row("I.3", 500),
      row("I.3.1", 300),
      row("I.3.2", 200),
    ]);
    const refs = (await stored(inventoryId))
      .map((v) => v.gpcReferenceNumber)
      .sort();
    expect(refs).toEqual(["I.3.1", "I.3.2"]);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(500_000);
  });

  it("results total skips rows marked excluded", async () => {
    const { inventoryId } = await importRows([
      row("I.1.1", 100),
      row("I.2.1", 50, true),
    ]);
    const values = await stored(inventoryId);
    const flag = Object.fromEntries(
      values.map((v) => [v.gpcReferenceNumber, v.omitFromTotal]),
    );
    expect(flag).toEqual({ "I.1.1": false, "I.2.1": true });
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(100_000);
  });

  it("an import of only subsector rows stores them", async () => {
    const { inventoryId, extracted } = await importRows([
      row("I.1", 10),
      row("I.2", 20),
      row("II.1", 30),
      row("III.1", 40),
    ]);
    expect(extracted.validRowCount).toBe(4);
    expect(await stored(inventoryId)).toHaveLength(4);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(100_000);
  });

  it("sector and scope breakdown with an unsplit I.3 row", async () => {
    const { inventoryId } = await importRows([
      row("I.3", 500),
      row("I.1.1", 100),
      row("IV.1", 50),
    ]);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(650_000);
    const energy = await getEmissionsBreakdown(
      inventoryId,
      "stationary-energy",
    );
    expect(energy.grossTotalEmissions.toNumber()).toBe(600_000);
    // The unsplit row counts in the sector total but in no scope column:
    // the results table only draws scopes 1, 2 and 3.
    const unsplit = energy.byScope.find(
      (r) => r.totalEmissions.toString() === "500000",
    )!;
    expect(
      Object.keys(unsplit.scopes).filter((k) => /^[123]$/.test(k)),
    ).toEqual([]);
    // The table shows IE for it (GPC Table 2.1), not 0.
    expect(unsplit.unsplitReferences).toEqual(["I.3"]);
    expect(Object.keys(unsplit.scopes)).toEqual([]);
    const scoped = energy.byScope.find(
      (r) => r.totalEmissions.toString() === "100000",
    )!;
    expect(scoped.unsplitReferences ?? []).toEqual([]);
  });

  it("carries scope basis and total inclusion onto the review", async () => {
    const extracted = await ECRFImportService.fromExtractedRows([
      { ...row("I.3", 500), scopeBasis: "combined", totalInclusion: "unclear" },
    ]);
    expect(extracted.rows[0].review).toMatchObject({
      scopeBasis: "combined",
      totalInclusion: "unclear",
    });
  });

  it("an eCRF sheet with a subsector subtotal keeps only its children", async () => {
    const headers = ["GPC ref. no.", "Total CO2e"];
    const data = [
      ["I.3", 500],
      ["I.3.1", 300],
      ["I.3.2", 200],
    ] as const;
    const sheet = {
      name: "Inventory",
      headers,
      rows: data.map(([ref, t]) => ({ [headers[0]]: ref, [headers[1]]: t })),
      rowNumbers: data.map((_, i) => i + 2),
    };
    const processed = await ECRFImportService.processECRFFile(
      { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData,
      { gpcRefNo: 0, totalCO2e: 1 },
    );
    const parent = processed.rows.find((r) => r.gpcRefNo === "I.3")!;
    expect(parent.issue).toBe("gpc-parent-superseded");
    expect(processed.validRowCount).toBe(2);
  });

  it("re-running the rule restores a parent whose children moved away", async () => {
    const extracted = await ECRFImportService.fromExtractedRows([
      row("I.3", 500),
      row("I.3.1", 500),
    ]);
    const parent = extracted.rows.find((r) => r.gpcRefNo === "I.3")!;
    expect(parent.issue).toBe("gpc-parent-superseded");

    // A review decision moves the only child to another subsector.
    const moved = await ECRFImportService.lookupGPCReference("I.4.1");
    const child = extracted.rows.find((r) => r.gpcRefNo === "I.3.1")!;
    Object.assign(child, {
      gpcRefNo: "I.4.1",
      subsectorId: moved!.subsectorId,
      subcategoryId: moved!.subcategoryId,
    });
    supersedeParentsWithChildren(extracted.rows, extracted.warnings);
    expect(parent.issue).toBeUndefined();
    expect(parent.errors).toBeUndefined();
    expect(parent.parentSuperseded).toBeUndefined();
  });

  it("re-running the rule keeps a single gap warning", async () => {
    const extracted = await ECRFImportService.fromExtractedRows([
      row("I.3", 1000),
      row("I.3.1", 500),
    ]);
    // applyReviewedRows runs the rule again after the parse.
    supersedeParentsWithChildren(extracted.rows, extracted.warnings);
    expect(
      extracted.warnings.filter((w) => w.includes("gap 500")),
    ).toHaveLength(1);
  });

  describe("rows that merge into one value", () => {
    // Several rows of one reference become one InventoryValue (unique per
    // inventory and reference) with one omitFromTotal flag.
    const counted = row("I.3.1", 100);
    const excluded = row("I.3.1", 20, true);

    async function reviewed(rows: ReturnType<typeof row>[]) {
      const result = await ECRFImportService.fromExtractedRows(rows);
      result.requiresReferenceReview = true;
      for (const r of result.rows) r.review!.decisionToken = `t${r.rowIndex}`;
      return result;
    }
    const decide = (rowIndex: number, reviewDecision: string) => ({
      [String(rowIndex)]: {
        decisionFileId: "file",
        decisionToken: `t${rowIndex}`,
        decisionRef: "I.3.1",
        decisionScope: null,
        decisionValue: rowIndex === 0 ? 100 : 20,
        reviewDecision,
      },
    });

    it("merges rows that all count into one counted value", async () => {
      const { inventoryId, summary } = await importRows([
        counted,
        row("I.3.1", 20),
      ]);
      expect(summary.errors).toEqual([]);
      const values = await stored(inventoryId);
      expect(values).toHaveLength(1);
      expect(BigInt(values[0].co2eq as unknown as string)).toBe(120_000n);
      expect(values[0].omitFromTotal).toBe(false);
      const results = await getEmissionResults(inventoryId);
      expect(results.totalEmissions.toNumber()).toBe(120_000);
    });

    it("holds the rows when one of them is left out of the total", async () => {
      const result = await reviewed([counted, excluded]);
      const pending = findPendingRows(result);
      expect(pending.map((r) => [r.rowIndex, r.issue])).toEqual([
        [0, "merge-total-inclusion-mixed"],
        [1, "merge-total-inclusion-mixed"],
      ]);
      const preview = await previewImportRows(
        result,
        InventoryTypeEnum.GPC_BASIC_PLUS,
      );
      expect(preview.pendingRows).toBe(2);
    });

    it("never stores a counted merge of mixed rows", async () => {
      const { inventoryId, summary } = await importRows([counted, excluded]);
      expect(summary.errors).toHaveLength(1);
      const values = await stored(inventoryId);
      expect(
        values.filter((v) => !v.omitFromTotal).map((v) => String(v.co2eq)),
      ).not.toContain("120000");
    });

    it("stays held while the decisions still disagree", async () => {
      const result = await reviewed([counted, excluded]);
      await applyReviewedRows(
        result,
        { ...decide(0, "keep"), ...decide(1, "omit") },
        "file",
      );
      expect(findPendingRows(result)).toHaveLength(2);
    });

    async function importReviewed(result: ECRFImportResult) {
      const inventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        cityId: city.cityId,
        inventoryName: `${PREFIX}inventory`,
        year: 2022,
        inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
        globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      });
      inventoryIds.push(inventory.inventoryId);
      const summary = await InventoryImportService.importECRFData(
        inventory.inventoryId,
        result,
      );
      expect(summary.errors).toEqual([]);
      return stored(inventory.inventoryId);
    }

    it.each([
      ["keep", false],
      ["omit", true],
    ] as const)(
      "imports one value once both rows say %s",
      async (decision, omit) => {
        const result = await reviewed([counted, excluded]);
        await applyReviewedRows(
          result,
          { ...decide(0, decision), ...decide(1, decision) },
          "file",
        );
        expect(findPendingRows(result)).toEqual([]);
        const values = await importReviewed(result);
        expect(values).toHaveLength(1);
        expect(BigInt(values[0].co2eq as unknown as string)).toBe(120_000n);
        expect(values[0].omitFromTotal).toBe(omit);
      },
    );

    it("keeps the counted part when the excluded row is skipped", async () => {
      const result = await reviewed([counted, excluded]);
      await applyReviewedRows(
        result,
        { ...decide(0, "keep"), ...decide(1, "skip") },
        "file",
      );
      expect(findPendingRows(result)).toEqual([]);
      const values = await importReviewed(result);
      expect(values).toHaveLength(1);
      expect(BigInt(values[0].co2eq as unknown as string)).toBe(100_000n);
      expect(values[0].omitFromTotal).toBe(false);
    });
  });

  describe("replacing the inventory", () => {
    // Mirco's example: the old inventory has I.3.1 = 100 t, the new file has
    // I.3 = 100 t (no scope split) and II.1.1 = 25 t.
    async function pdfWaitingForApproval(inventoryId: string) {
      return db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId,
        fileName: "replace.pdf",
        originalFileName: "replace.pdf",
        fileType: "pdf",
        fileSize: 1,
        data: Buffer.from("x"),
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        mappingConfiguration: {
          rows: [row("I.3", 100), row("II.1.1", 25)],
        },
        rowCount: 2,
        validationResults: { errors: [], warnings: [] },
      });
    }

    beforeAll(async () => {
      setupTests();
      await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
      await city.addUser(testUserID);
    });

    it("the preview checks the file only against itself", async () => {
      const { inventoryId } = await importRows([row("I.3.1", 100)]);
      const file = await pdfWaitingForApproval(inventoryId);
      const { importResult } = await buildImportResult(file);
      expect(importResult.rows.map((r) => r.errors ?? [])).toEqual([[], []]);
      expect(importResult.rows.every((r) => !r.issue)).toBe(true);
      const preview = await previewImportRows(
        importResult,
        InventoryTypeEnum.GPC_BASIC_PLUS,
      );
      expect(preview.importedRows).toBe(2);
      expect(preview.pendingRows).toBe(0);
      expect(preview.rows.map((r) => r.issue)).not.toContain(
        "gpc-parent-superseded",
      );
    });

    it("does not flag a child of a stored subsector value", async () => {
      const { inventoryId } = await importRows([row("I.3", 500)]);
      const file = await db.models.ImportedInventoryFile.create({
        ...(await pdfWaitingForApproval(inventoryId)).toJSON(),
        id: randomUUID(),
        mappingConfiguration: { rows: [row("I.3.1", 300)] },
      });
      const { importResult } = await buildImportResult(file);
      expect(importResult.rows[0]).not.toHaveProperty("storedParent");
      const preview = await previewImportRows(
        importResult,
        InventoryTypeEnum.GPC_BASIC_PLUS,
      );
      expect(preview.rows).toEqual([]);
    });

    it("approve with replaceExisting saves both incoming rows", async () => {
      const { inventoryId } = await importRows([row("I.3.1", 100)]);
      const file = await pdfWaitingForApproval(inventoryId);
      const response = await approveImport(
        mockRequest({ importedFileId: file.id, replaceExisting: true }),
        {
          params: Promise.resolve({
            city: city.cityId,
            inventory: inventoryId,
          }),
        },
      );
      await expectStatusCode(response, 202);
      for (let attempt = 0; attempt < 100; attempt++) {
        await file.reload();
        if (
          file.importStatus === ImportStatusEnum.COMPLETED ||
          file.importStatus === ImportStatusEnum.FAILED
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(file.errorLog ?? null).toBeNull();
      expect(file.importStatus).toBe(ImportStatusEnum.COMPLETED);
      const refs = (await stored(inventoryId))
        .map((v) => v.gpcReferenceNumber)
        .sort();
      expect(refs).toEqual(["I.3", "II.1.1"]);
      const results = await getEmissionResults(inventoryId);
      expect(results.totalEmissions.toNumber()).toBe(125_000);
      // Let the background catalogue sync finish before the suite closes.
      for (let attempt = 0; attempt < 100; attempt++) {
        const entry = await db.models.NativeInputCatalog.findOne({
          where: { kind: "inventory_import", sourceId: inventoryId },
        });
        if (entry?.labels?.importedFileId === file.id) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
  });
});
