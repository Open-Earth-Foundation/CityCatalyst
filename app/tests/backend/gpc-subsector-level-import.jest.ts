/**
 * CC-1311: subsector-level values (`I.3` with no scope split) on the real
 * catalogue built by the migrations and the GPC seeder.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import env from "@next/env";
import ECRFImportService from "@/backend/ECRFImportService";
import { db } from "@/models";

describe("subsector-level GPC references", () => {
  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();
  });

  afterAll(async () => {
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

});
