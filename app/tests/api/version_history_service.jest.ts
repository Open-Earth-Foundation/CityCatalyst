import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { randomUUID } from "node:crypto";

// --- Mock setup ---

const mockVersionFindOne =
  jest.fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>();
const mockVersionFindAll =
  jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>[]>>();
const mockVersionCreate =
  jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();
const mockVersionDestroy = jest.fn<(...args: unknown[]) => Promise<number>>();
const mockTransaction = { id: "mock-transaction" };

function createMockModel() {
  return {
    update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    destroy: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
}

const mockInventoryValueModel = createMockModel();
const mockActivityValueModel = createMockModel();
const mockGasValueModel = createMockModel();
const mockEmissionsFactorModel = createMockModel();
const allMockModels = [
  mockInventoryValueModel,
  mockActivityValueModel,
  mockGasValueModel,
  mockEmissionsFactorModel,
];

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      Version: {
        findOne: mockVersionFindOne,
        findAll: mockVersionFindAll,
        create: mockVersionCreate,
        destroy: mockVersionDestroy,
      },
      InventoryValue: mockInventoryValueModel,
      ActivityValue: mockActivityValueModel,
      GasValue: mockGasValueModel,
      EmissionsFactor: mockEmissionsFactorModel,
      User: {},
    },
    sequelize: {
      transaction: jest.fn((cb: (t: unknown) => unknown) =>
        cb(mockTransaction),
      ),
    },
  },
}));

const { default: VersionHistoryService } =
  await import("@/backend/VersionHistoryService");

// --- Helpers ---

function createMockVersion(overrides: Record<string, unknown> = {}) {
  return {
    versionId: randomUUID(),
    inventoryId: randomUUID(),
    authorId: randomUUID(),
    entryId: randomUUID(),
    table: "InventoryValue",
    data: { id: randomUUID(), co2eq: 100 },
    isDeleted: false,
    created: new Date(),
    previousVersion: null,
    ...overrides,
  };
}

// --- Tests ---

describe("VersionHistoryService", () => {
  const inventoryId = randomUUID();
  const authorId = randomUUID();
  const entryId = randomUUID();

  beforeEach(() => {
    jest.clearAllMocks();
    // by default an update finds the row it targets
    for (const model of allMockModels) {
      model.update.mockResolvedValue([1]);
    }
  });

  describe("createVersion", () => {
    it("should throw BadRequest when inventoryId is undefined", async () => {
      await expect(
        VersionHistoryService.createVersion(
          undefined,
          "InventoryValue",
          entryId,
          authorId,
          { id: entryId },
        ),
      ).rejects.toThrow("missing-inventory-id");

      expect(mockVersionFindOne).not.toHaveBeenCalled();
      expect(mockVersionCreate).not.toHaveBeenCalled();
    });

    it("should throw BadRequest when authorId is undefined", async () => {
      await expect(
        VersionHistoryService.createVersion(
          inventoryId,
          "InventoryValue",
          entryId,
          undefined,
          { id: entryId },
        ),
      ).rejects.toThrow("missing-user-id");

      expect(mockVersionFindOne).not.toHaveBeenCalled();
      expect(mockVersionCreate).not.toHaveBeenCalled();
    });

    it("should link to previous version when one exists", async () => {
      const previousVersionId = randomUUID();
      mockVersionFindOne.mockResolvedValueOnce({
        versionId: previousVersionId,
      });

      await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        entryId,
        authorId,
        { id: entryId, co2eq: 200 },
      );

      expect(mockVersionFindOne).toHaveBeenCalledWith({
        where: {
          inventoryId,
          entryId,
          table: "InventoryValue",
          moduleName: "ghgi",
        },
        order: [["created", "DESC"]],
      });
      expect(mockVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          previousVersionId,
          inventoryId,
          authorId,
          table: "InventoryValue",
          entryId,
          data: { id: entryId, co2eq: 200 },
          isDeleted: false,
        }),
        expect.objectContaining({}),
      );
    });

    it("should set previousVersionId to undefined when no prior version exists", async () => {
      mockVersionFindOne.mockResolvedValueOnce(null);

      await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        entryId,
        authorId,
        { id: entryId },
      );

      expect(mockVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          previousVersionId: undefined,
        }),
        expect.objectContaining({}),
      );
    });

    it("should skip a non-deletion version whose data equals the previous version", async () => {
      mockVersionFindOne.mockResolvedValueOnce({
        versionId: randomUUID(),
        data: { id: entryId, co2eq: 100 },
        isDeleted: false,
      });

      await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        entryId,
        authorId,
        { id: entryId, co2eq: 100 },
      );

      expect(mockVersionCreate).not.toHaveBeenCalled();
    });

    it("should record a deletion even when its data equals the previous version", async () => {
      const previousVersionId = randomUUID();
      mockVersionFindOne.mockResolvedValueOnce({
        versionId: previousVersionId,
        data: { id: entryId, co2eq: 100 },
        isDeleted: false,
      });

      await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        entryId,
        authorId,
        { id: entryId, co2eq: 100 },
        true,
      );

      expect(mockVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ previousVersionId, isDeleted: true }),
        expect.objectContaining({}),
      );
    });

    it("should pass the label, created time and transaction through", async () => {
      mockVersionFindOne.mockResolvedValueOnce(null);
      const created = new Date("2026-01-01T00:00:00.000Z");

      await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        entryId,
        authorId,
        { id: entryId },
        false,
        mockTransaction as never,
        "ghgi",
        { label: "import-replace-before", created },
      );

      expect(mockVersionFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ transaction: mockTransaction }),
      );
      expect(mockVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ label: "import-replace-before", created }),
        { transaction: mockTransaction },
      );
    });
  });

  describe("bulkCreateVersions", () => {
    it("should call createVersion once per entry with correct entryId", async () => {
      const createVersionSpy = jest.spyOn(
        VersionHistoryService,
        "createVersion",
      );
      createVersionSpy.mockResolvedValue(undefined);

      const entry1 = { id: randomUUID(), co2eq: 100 };
      const entry2 = { id: randomUUID(), co2eq: 200 };
      const entry3 = { id: randomUUID(), co2eq: 300 };

      await VersionHistoryService.bulkCreateVersions(
        inventoryId,
        "InventoryValue",
        authorId,
        [entry1, entry2, entry3],
        true,
      );

      expect(createVersionSpy).toHaveBeenCalledTimes(3);
      expect(createVersionSpy).toHaveBeenCalledWith(
        inventoryId,
        "InventoryValue",
        entry1.id,
        authorId,
        entry1,
        true,
        undefined,
        "ghgi",
      );
      expect(createVersionSpy).toHaveBeenCalledWith(
        inventoryId,
        "InventoryValue",
        entry2.id,
        authorId,
        entry2,
        true,
        undefined,
        "ghgi",
      );
      expect(createVersionSpy).toHaveBeenCalledWith(
        inventoryId,
        "InventoryValue",
        entry3.id,
        authorId,
        entry3,
        true,
        undefined,
        "ghgi",
      );

      createVersionSpy.mockRestore();
    });
  });

  describe("restoreVersion", () => {
    it("should throw NotFound when the version does not belong to the inventory", async () => {
      const versionId = randomUUID();
      mockVersionFindOne.mockResolvedValueOnce(null);

      await expect(
        VersionHistoryService.restoreVersion(versionId, inventoryId),
      ).rejects.toThrow("version-not-found");

      expect(mockVersionFindOne).toHaveBeenCalledWith({
        where: { versionId, inventoryId },
      });
      expect(mockVersionFindAll).not.toHaveBeenCalled();
    });

    it("should throw BadRequest when no newer versions exist", async () => {
      const version = createMockVersion();
      mockVersionFindOne.mockResolvedValueOnce(version);
      mockVersionFindAll.mockResolvedValueOnce([]);

      await expect(
        VersionHistoryService.restoreVersion(
          version.versionId,
          version.inventoryId,
        ),
      ).rejects.toThrow("no-newer-versions-found");
    });

    it("should call model.update when previousVersion exists and is not deleted", async () => {
      const targetVersion = createMockVersion();
      const previousData = { id: entryId, co2eq: 100 };
      const newerVersion = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        table: "InventoryValue",
        isDeleted: false,
        previousVersion: {
          data: previousData,
          isDeleted: false,
        },
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([newerVersion]);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(mockInventoryValueModel.update).toHaveBeenCalledWith(
        previousData,
        { where: { id: entryId }, transaction: mockTransaction },
      );
      expect(mockInventoryValueModel.create).not.toHaveBeenCalled();
      expect(mockVersionDestroy).toHaveBeenCalledWith({
        where: { versionId: [newerVersion.versionId] },
        transaction: mockTransaction,
      });
    });

    it("should re-create the entry when it was deleted after the restore point", async () => {
      const targetVersion = createMockVersion();
      const previousData = { id: entryId, co2eq: 100 };
      const newerVersion = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        table: "InventoryValue",
        isDeleted: true,
        previousVersion: {
          data: previousData,
          isDeleted: false,
        },
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([newerVersion]);
      // the row is gone, so the update matches nothing
      mockInventoryValueModel.update.mockResolvedValueOnce([0]);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(mockInventoryValueModel.create).toHaveBeenCalledWith(
        previousData,
        { transaction: mockTransaction },
      );
    });

    it("should call model.destroy when no previousVersion exists", async () => {
      const targetVersion = createMockVersion();
      const newerVersion = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        table: "InventoryValue",
        previousVersion: null,
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([newerVersion]);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(mockInventoryValueModel.destroy).toHaveBeenCalledWith({
        where: { id: entryId },
        transaction: mockTransaction,
      });
      expect(mockInventoryValueModel.update).not.toHaveBeenCalled();
    });

    it("should call model.destroy when previousVersion was itself a deletion", async () => {
      const targetVersion = createMockVersion();
      const newerVersion = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        table: "InventoryValue",
        isDeleted: false,
        previousVersion: {
          data: { id: entryId, co2eq: 50 },
          isDeleted: true,
        },
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([newerVersion]);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(mockInventoryValueModel.destroy).toHaveBeenCalledWith({
        where: { id: entryId },
        transaction: mockTransaction,
      });
      expect(mockInventoryValueModel.update).not.toHaveBeenCalled();
    });

    it("should restore each entry to its state at the restore point, ignoring later changes", async () => {
      const targetVersion = createMockVersion();
      const restorePointData = { id: entryId, co2eq: 50 };
      const firstChange = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        previousVersion: { data: restorePointData, isDeleted: false },
      });
      const laterChange = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        previousVersion: { data: { id: entryId, co2eq: 75 }, isDeleted: false },
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([firstChange, laterChange]);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(mockInventoryValueModel.update).toHaveBeenCalledTimes(1);
      expect(mockInventoryValueModel.update).toHaveBeenCalledWith(
        restorePointData,
        { where: { id: entryId }, transaction: mockTransaction },
      );
    });

    it("should re-create deleted parents before their children", async () => {
      const targetVersion = createMockVersion();
      const createdTables: string[] = [];
      const trackCreate = (table: string) => async () => {
        createdTables.push(table);
      };
      mockGasValueModel.create.mockImplementationOnce(trackCreate("GasValue"));
      mockActivityValueModel.create.mockImplementationOnce(
        trackCreate("ActivityValue"),
      );
      mockInventoryValueModel.create.mockImplementationOnce(
        trackCreate("InventoryValue"),
      );

      // all three were deleted in the same millisecond, children listed first
      const deletion = (table: string) =>
        createMockVersion({
          inventoryId: targetVersion.inventoryId,
          entryId: randomUUID(),
          table,
          isDeleted: true,
          previousVersion: { data: { id: randomUUID() }, isDeleted: false },
        });
      const newerVersions = [
        deletion("GasValue"),
        deletion("ActivityValue"),
        deletion("InventoryValue"),
      ];
      for (const model of allMockModels) {
        model.update.mockResolvedValue([0]);
      }

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce(newerVersions);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(createdTables).toEqual([
        "InventoryValue",
        "ActivityValue",
        "GasValue",
      ]);
    });

    it("should remove all newer versions in a single statement", async () => {
      const targetVersion = createMockVersion();
      const newerVersion1 = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        previousVersion: { data: { id: entryId }, isDeleted: false },
      });
      const newerVersion2 = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId: randomUUID(),
        previousVersion: null,
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([newerVersion1, newerVersion2]);

      await VersionHistoryService.restoreVersion(
        targetVersion.versionId,
        targetVersion.inventoryId,
      );

      expect(mockVersionDestroy).toHaveBeenCalledTimes(1);
      expect(mockVersionDestroy).toHaveBeenCalledWith({
        where: {
          versionId: [newerVersion1.versionId, newerVersion2.versionId],
        },
        transaction: mockTransaction,
      });
    });
  });
});
