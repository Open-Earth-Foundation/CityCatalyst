import { describe, expect, it } from "@jest/globals";
import { dsarCollectors } from "@/backend/gdpr/DsarExportService";
import {
  buildDsarExport,
  shapeDataset,
  toDsarCsv,
} from "@/backend/gdpr/dsar-format";
import { PERSONAL_DATA_INVENTORY } from "@/util/gdpr/personal-data-inventory";
import { REDACTED } from "@/util/gdpr/constants";

const userDataset = PERSONAL_DATA_INVENTORY.find(
  (dataset) => dataset.table === "User",
);

describe("DSAR coverage", () => {
  it("has one collector for every inventoried table", () => {
    expect(Object.keys(dsarCollectors).sort()).toEqual(
      PERSONAL_DATA_INVENTORY.map((dataset) => dataset.table).sort(),
    );
  });

  it("replaces stored secrets and leaves empty secrets null", () => {
    expect(userDataset).toBeDefined();
    const [row] = shapeDataset(userDataset!, [
      {
        userId: "user-1",
        name: "Ada",
        email: "ada@example.com",
        passwordHash: "hashed-secret",
        twoFactorSecret: null,
        twoFactorRecoveryHashes: ["recovery-code"],
      },
    ]);

    expect(row.name).toBe("Ada");
    expect(row.passwordHash).toBe(REDACTED);
    expect(row.twoFactorSecret).toBeNull();
    expect(row.twoFactorRecoveryHashes).toBe(REDACTED);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("hashed-secret");
    expect(serialized).not.toContain("recovery-code");
  });

  it("escapes commas and quotes in the CSV", () => {
    expect(userDataset).toBeDefined();
    const csv = toDsarCsv([
      {
        dataset: userDataset!,
        rows: [{ userId: "user-1", name: 'Ada, "Lovelace"' }],
      },
    ]);
    expect(csv.startsWith("dataset,record_id,field,value\r\n")).toBe(true);
    expect(csv).toContain('"Ada, ""Lovelace"""');
    expect(csv).toContain("User,user-1,name,");
  });

  it("names truncated tables in the JSON document", () => {
    expect(userDataset).toBeDefined();
    const { document } = buildDsarExport({
      userId: "user-1",
      exportedAt: new Date("2026-09-28T00:00:00.000Z"),
      datasets: [
        {
          dataset: userDataset!,
          rows: [{ userId: "user-1", name: "Ada" }],
          truncated: true,
        },
      ],
    });
    expect(document.truncation).toEqual({ User: true });
    expect(document.data.User[0].name).toBe("Ada");
    expect(document.subject).toEqual({ userId: "user-1" });
  });
});
