import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";
import Excel from "exceljs";
import { db } from "@/models";
import ECRFImportService from "@/backend/ECRFImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import type { ImportedInventoryFile } from "@/models/ImportedInventoryFile";
import type { Inventory } from "@/models/Inventory";
import type { Sector } from "@/models/Sector";
import { ImportStatusEnum, InventoryTypeEnum } from "@/util/enums";

jest.unstable_mockModule("@/util/api", () => ({
  apiHandler:
    (
      handler: (
        req: NextRequest,
        context: {
          params: Record<string, string>;
          session: { user: { id: string } };
        },
      ) => Promise<Response>,
    ) =>
    async (
      req: NextRequest,
      props: { params: Promise<Record<string, string>> },
    ) =>
      handler(req, {
        params: await props.params,
        session: { user: { id: "test-user" } },
      }),
}));
jest.unstable_mockModule("@/backend/UserService", () => ({
  default: {
    findUserInventory: jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined),
  },
}));
jest.unstable_mockModule("@/backend/GHGINativeInputCatalogService", () => ({
  syncGHGIImportedInventorySource: jest
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
  syncGHGIInventory: jest
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getInventoryPdfOcrStatus: jest
    .fn<() => Promise<null>>()
    .mockResolvedValue(null),
}));

const { GET } =
  await import("@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/route");

const params = {
  city: "18b7a49b-8e53-4821-a375-0b8790325130",
  inventory: "d2657467-dc3c-4d55-9988-8c7c9067ae25",
  importedFileId: "f5917e82-1411-41cb-b664-21480c5f20d6",
};
const extractedRow = {
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  scope: "3",
  totalCO2e: 12,
};
let importedFile: ImportedInventoryFile;
let inventory: Inventory;

beforeEach(() => {
  importedFile = {
    id: params.importedFileId,
    fileType: "pdf",
    originalFileName: "inventory.pdf",
    importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
    validationResults: {},
    mappingConfiguration: { rows: [extractedRow], mappingsApplied: true },
  } as unknown as ImportedInventoryFile;
  inventory = { inventoryType: InventoryTypeEnum.GPC_BASIC } as Inventory;
  jest
    .spyOn(db.models.ImportedInventoryFile, "findOne")
    .mockImplementation(async () => importedFile);
  jest
    .spyOn(db.models.Inventory, "findOne")
    .mockImplementation(async () => inventory);
  jest.spyOn(db.models.Scope, "findAll").mockResolvedValue([]);
  jest
    .spyOn(ECRFImportService, "lookupGPCReference")
    .mockImplementation(async (ref) =>
      ["I.1.1", "I.1.3"].includes(ref)
        ? ({
            sectorId: "sector-I",
            subsectorId: "subsector-I.1",
            subcategoryId: `subcategory-${ref}`,
            scopeId: "scope",
          } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>)
        : null,
    );
  jest
    .spyOn(InventoryProgressService, "getSortedInventoryStructure")
    .mockResolvedValue([
      {
        sectorId: "sector-I",
        referenceNumber: "I",
        subSectors: [
          {
            referenceNumber: "I.1",
            subCategories: [
              { referenceNumber: "I.1.1", scope: { scopeName: "1" } },
              { referenceNumber: "I.1.3", scope: { scopeName: "3" } },
            ],
          },
        ],
      },
    ] as unknown as Sector[]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function outsideRefs(
  mappingOverrides?: Record<string, unknown>,
): Promise<string[]> {
  const url = new URL("http://localhost/api/v1/import");
  if (mappingOverrides)
    url.searchParams.set("mappingOverrides", JSON.stringify(mappingOverrides));
  const res = await GET(new NextRequest(url), {
    params: Promise.resolve(params),
  });
  expect(res.status).toBe(200);
  return (await res.json()).data.rowsOutsideInventoryType;
}

describe("import status reporting-level warning", () => {
  it.each(["pdf", "AI"])(
    "resolves %s rows from sector/subsector text before checking the inventory level",
    async (kind) => {
      if (kind === "AI") {
        importedFile.fileType = "xlsx";
        importedFile.mappingConfiguration!.keyValueShaped = true;
      }
      expect(await outsideRefs()).toEqual(["I.1.3"]);
    },
  );

  it("applies saved row overrides before checking the inventory level", async () => {
    importedFile.mappingConfiguration!.rows = [
      { ...extractedRow, gpcRefNo: "I.1.1" },
    ];
    importedFile.mappingConfiguration!.overrides = {
      "0": { gpcRefNo: "I.1.3" },
    };
    expect(await outsideRefs()).toEqual(["I.1.3"]);
  });

  it("uses current unsaved overrides instead of saved overrides without mutating the file", async () => {
    importedFile.mappingConfiguration!.overrides = {
      "0": { gpcRefNo: "I.1.3" },
    };
    const original = JSON.stringify(importedFile.mappingConfiguration);
    expect(await outsideRefs({ "0": { gpcRefNo: "I.1.1" } })).toEqual([]);
    expect(JSON.stringify(importedFile.mappingConfiguration)).toBe(original);
  });

  it("applies current tabular column overrides through the file parser", async () => {
    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("eCRF_3");
    sheet.addRow(["Original ref", "Corrected ref", "Total CO2e"]);
    sheet.addRow(["I.1.1", "I.1.3", 12]);
    importedFile.fileType = "xlsx";
    importedFile.data = Buffer.from(await workbook.xlsx.writeBuffer());
    importedFile.validationResults = {
      detectedColumns: { gpcRefNo: 0, totalCO2e: 2 },
    };
    importedFile.mappingConfiguration = { rows: [] };
    expect(await outsideRefs()).toEqual([]);
    expect(await outsideRefs({ "Corrected ref": "gpcRefNo" })).toEqual([
      "I.1.3",
    ]);
  });

  it("deduplicates not-counted refs and excludes skipped rows", async () => {
    importedFile.mappingConfiguration!.rows = [
      extractedRow,
      extractedRow,
      { ...extractedRow, totalCO2e: 0 },
      { ...extractedRow, gpcRefNo: "I.9.9" },
    ];
    expect(await outsideRefs()).toEqual(["I.1.3"]);
  });

  it("returns no warning for BASIC+ or a file that is still processing", async () => {
    inventory.inventoryType = InventoryTypeEnum.GPC_BASIC_PLUS;
    expect(await outsideRefs()).toEqual([]);
    inventory.inventoryType = InventoryTypeEnum.GPC_BASIC;
    importedFile.importStatus = ImportStatusEnum.PROCESSING;
    expect(await outsideRefs()).toEqual([]);
    expect(ECRFImportService.lookupGPCReference).toHaveBeenCalledTimes(1);
  });
});
