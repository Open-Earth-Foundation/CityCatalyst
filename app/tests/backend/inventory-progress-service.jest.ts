import { afterEach, describe, expect, it, jest } from "@jest/globals";
import InventoryProgressService from "@/backend/InventoryProgressService";
import type { Inventory } from "@/models/Inventory";
import type { Sector } from "@/models/Sector";
import { InventoryTypeEnum } from "@/util/enums";

type SubCategorySpec = [referenceNumber: string, scope: string];

function subSector(referenceNumber: string, subCategories: SubCategorySpec[]) {
  return {
    sectorId: `sector-${referenceNumber.split(".")[0]}`,
    referenceNumber,
    scopeId: "scope-1",
    subsectorId: `subsector-${referenceNumber}`,
    subsectorName: referenceNumber,
    subCategories: subCategories.map(([subReference, scope]) => ({
      subcategoryId: `subcategory-${subReference}`,
      subcategoryName: subReference,
      activityName: subReference,
      referenceNumber: subReference,
      subsectorId: `subsector-${referenceNumber}`,
      scopeId: `scope-${scope}`,
      scope: { scopeName: scope },
      reportinglevelId: null,
    })),
  };
}

function sector(referenceNumber: string, subSectors: unknown[]) {
  return {
    sectorId: `sector-${referenceNumber}`,
    referenceNumber,
    sectorName: referenceNumber,
    subSectors,
  };
}

// I and II have Scope 3 rows that GPC BASIC does not require; IV and V only
// count for GPC BASIC+.
const STRUCTURE = [
  sector("I", [
    subSector("I.1", [
      ["I.1.1", "1"],
      ["I.1.2", "2"],
      ["I.1.3", "3"],
    ]),
    subSector("I.2", [
      ["I.2.1", "1"],
      ["I.2.2", "2"],
      ["I.2.3", "3"],
    ]),
  ]),
  sector("II", [
    subSector("II.1", [
      ["II.1.1", "1"],
      ["II.1.2", "2"],
      ["II.1.3", "3"],
    ]),
  ]),
  sector("III", [
    subSector("III.1", [
      ["III.1.1", "1"],
      ["III.1.2", "3"],
    ]),
  ]),
  sector("IV", [subSector("IV.1", []), subSector("IV.2", [])]),
  sector("V", [subSector("V.1", [])]),
] as unknown as Sector[];

type ValueSpec = {
  dataSource?: object;
  unavailableReason?: string;
  withoutSubCategoryId?: boolean;
};

function value(gpcReferenceNumber: string, spec: ValueSpec = {}) {
  const parts = gpcReferenceNumber.split(".");
  const subSectorReference = parts.slice(0, 2).join(".");
  const hasSubCategory = parts.length === 3 && !spec.withoutSubCategoryId;
  return {
    gpcReferenceNumber,
    sectorId: `sector-${parts[0]}`,
    subSectorId: `subsector-${subSectorReference}`,
    subCategoryId: hasSubCategory
      ? `subcategory-${gpcReferenceNumber}`
      : undefined,
    dataSource: spec.dataSource,
    unavailableReason: spec.unavailableReason,
  };
}

function inventory(
  inventoryType: InventoryTypeEnum,
  inventoryValues: ReturnType<typeof value>[],
) {
  return { inventoryType, inventoryValues } as unknown as Inventory;
}

async function progressFor(
  inventoryType: InventoryTypeEnum,
  inventoryValues: ReturnType<typeof value>[],
) {
  jest
    .spyOn(InventoryProgressService, "getSortedInventoryStructure")
    .mockResolvedValue(STRUCTURE);
  const progress = await InventoryProgressService.getInventoryProgress(
    inventory(inventoryType, inventoryValues),
  );
  const bySector = Object.fromEntries(
    progress.sectorProgress.map((sectorProgress) => [
      sectorProgress.sector.referenceNumber,
      sectorProgress,
    ]),
  );
  return { progress, bySector };
}

function filled(sectorProgress: {
  thirdParty: number;
  uploaded: number;
  reasonNE: number;
  reasonNO: number;
}) {
  return (
    sectorProgress.thirdParty +
    sectorProgress.uploaded +
    sectorProgress.reasonNE +
    sectorProgress.reasonNO
  );
}

const ALL_GPC_ROWS = [
  "I.1.1",
  "I.1.2",
  "I.1.3",
  "I.2.1",
  "I.2.2",
  "I.2.3",
  "II.1.1",
  "II.1.2",
  "II.1.3",
  "III.1.1",
  "III.1.2",
];

describe("InventoryProgressService.getInventoryProgress", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ignores Scope 3 rows that GPC BASIC does not require", async () => {
    const { progress, bySector } = await progressFor(
      InventoryTypeEnum.GPC_BASIC,
      ALL_GPC_ROWS.map((reference) => value(reference)),
    );

    expect(Object.keys(bySector)).toEqual(["I", "II", "III"]);
    expect(bySector.I.total).toBe(4);
    expect(filled(bySector.I)).toBe(4);
    expect(bySector.II.total).toBe(2);
    expect(filled(bySector.II)).toBe(2);
    expect(bySector.III.total).toBe(2);
    expect(filled(bySector.III)).toBe(2);
    expect(bySector.I.subSectors[0]).toMatchObject({
      completed: true,
      completedCount: 2,
      totalCount: 2,
    });
    expect(progress.totalProgress.total).toBe(8);
    expect(filled(progress.totalProgress)).toBe(8);
  });

  it("counts Scope 3 rows and sectors IV-V for GPC BASIC+", async () => {
    const { progress, bySector } = await progressFor(
      InventoryTypeEnum.GPC_BASIC_PLUS,
      [...ALL_GPC_ROWS, "IV.1"].map((reference) => value(reference)),
    );

    expect(bySector.I.total).toBe(6);
    expect(filled(bySector.I)).toBe(6);
    expect(bySector.II.total).toBe(3);
    expect(filled(bySector.II)).toBe(3);
    expect(bySector.IV.total).toBe(2);
    expect(filled(bySector.IV)).toBe(1);
    expect(bySector.V.total).toBe(1);
    expect(filled(bySector.V)).toBe(0);
    expect(progress.totalProgress.total).toBe(14);
    expect(filled(progress.totalProgress)).toBe(12);
  });

  it("reports partial inventories accurately", async () => {
    const { bySector } = await progressFor(InventoryTypeEnum.GPC_BASIC, [
      value("I.1.1"),
      value("I.1.3"),
      value("III.1.2", { unavailableReason: "NO" }),
    ]);

    expect(bySector.I).toMatchObject({ total: 4, uploaded: 1 });
    expect(filled(bySector.I)).toBe(1);
    expect(bySector.I.subSectors[0]).toMatchObject({
      completed: false,
      completedCount: 1,
      totalCount: 2,
    });
    expect(filled(bySector.II)).toBe(0);
    expect(bySector.III).toMatchObject({ total: 2, reasonNO: 1 });
  });

  it("counts a GPC row once even when it is stored more than once", async () => {
    const { bySector } = await progressFor(InventoryTypeEnum.GPC_BASIC, [
      value("I.1.1", { unavailableReason: "NE" }),
      value("I.1.1", { dataSource: {} }),
      value("I.1.1"),
    ]);

    expect(bySector.I).toMatchObject({
      total: 4,
      thirdParty: 1,
      uploaded: 0,
      reasonNE: 0,
    });
  });

  it("matches rows by GPC reference when the subcategory id is missing", async () => {
    const { bySector } = await progressFor(InventoryTypeEnum.GPC_BASIC, [
      value("I.1.1", { withoutSubCategoryId: true }),
      value("I.1.3", { withoutSubCategoryId: true }),
    ]);

    expect(filled(bySector.I)).toBe(1);
  });
});

describe("InventoryProgressService.findReferencesOutsideInventoryType", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function outsideFor(
    inventoryType: InventoryTypeEnum,
    references: string[],
  ) {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);
    return InventoryProgressService.findReferencesOutsideInventoryType(
      inventoryType,
      references,
    );
  }

  it("lists Scope 3 and IPPU/AFOLU rows once for GPC BASIC", async () => {
    await expect(
      outsideFor(InventoryTypeEnum.GPC_BASIC, [
        ...ALL_GPC_ROWS,
        "I.1.3",
        " II.1.3 ",
        "IV.1",
        "V.1",
      ]),
    ).resolves.toEqual(["I.1.3", "I.2.3", "II.1.3", "IV.1", "V.1"]);
  });

  it("accepts every known row for GPC BASIC+", async () => {
    await expect(
      outsideFor(InventoryTypeEnum.GPC_BASIC_PLUS, [
        ...ALL_GPC_ROWS,
        "IV.1",
        "V.1",
      ]),
    ).resolves.toEqual([]);
  });

  it("ignores references that are not in the GPC taxonomy", async () => {
    await expect(
      outsideFor(InventoryTypeEnum.GPC_BASIC, ["I.9.9", "VI.1", ""]),
    ).resolves.toEqual([]);
  });
});
