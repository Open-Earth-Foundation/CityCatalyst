import { jest, describe, it, expect } from "@jest/globals";
import { randomUUID } from "node:crypto";

// --- Mock setup ---

const mockVersionFindOne =
  jest.fn<(...args: any[]) => Promise<Record<string, any> | null>>();
const mockVersionFindAll =
  jest.fn<(...args: any[]) => Promise<Record<string, any>[]>>();
const mockVersionCreate =
  jest.fn<(...args: any[]) => Promise<Record<string, any>>>();
const mockTransaction = { id: "mock-transaction" };

const mockInventoryValueModel = {
  update: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
};
const mockActivityValueModel = {
  update: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
};
const mockGasValueModel = {
  update: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
};
const mockEmissionsFactorModel = {
  update: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
};

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      Version: {
        findOne: mockVersionFindOne,
        findAll: mockVersionFindAll,
        create: mockVersionCreate,
      },
      InventoryValue: mockInventoryValueModel,
      ActivityValue: mockActivityValueModel,
      GasValue: mockGasValueModel,
      EmissionsFactor: mockEmissionsFactorModel,
      User: {},
    },
    sequelize: {
      transaction: jest.fn((cb: (t: any) => any) => cb(mockTransaction)),
    },
  },
}));

const { default: VersionHistoryService } = await import(
  "@/backend/VersionHistoryService"
);

// --- Helpers ---

function createMockVersion(overrides: Record<string, any> = {}) {
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
    destroy: jest.fn(),
    ...overrides,
  };
}

// --- Tests ---

describe("VersionHistoryService", () => {
  const inventoryId = randomUUID();
  const authorId = randomUUID();
  const entryId = randomUUID();

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
        where: { inventoryId, entryId, table: "InventoryValue" },
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
        { transaction: undefined },
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
        { transaction: undefined },
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
      );
      expect(createVersionSpy).toHaveBeenCalledWith(
        inventoryId,
        "InventoryValue",
        entry2.id,
        authorId,
        entry2,
        true,
        undefined,
      );
      expect(createVersionSpy).toHaveBeenCalledWith(
        inventoryId,
        "InventoryValue",
        entry3.id,
        authorId,
        entry3,
        true,
        undefined,
      );

      createVersionSpy.mockRestore();
    });
  });

  describe("restoreVersion", () => {
    it("should throw NotFound when version does not exist", async () => {
      mockVersionFindOne.mockResolvedValueOnce(null);

      await expect(
        VersionHistoryService.restoreVersion(randomUUID()),
      ).rejects.toThrow("version-not-found");

      expect(mockVersionFindAll).not.toHaveBeenCalled();
    });

    it("should throw BadRequest when no newer versions exist", async () => {
      const version = createMockVersion();
      mockVersionFindOne.mockResolvedValueOnce(version);
      mockVersionFindAll.mockResolvedValueOnce([]);

      await expect(
        VersionHistoryService.restoreVersion(version.versionId),
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

      await VersionHistoryService.restoreVersion(targetVersion.versionId);

      expect(mockInventoryValueModel.update).toHaveBeenCalledWith(
        previousData,
        { where: { id: entryId }, transaction: mockTransaction },
      );
      expect(newerVersion.destroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
    });

    it("should call model.create when current version is a deletion and previousVersion has data", async () => {
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

      await VersionHistoryService.restoreVersion(targetVersion.versionId);

      expect(mockInventoryValueModel.create).toHaveBeenCalledWith(
        previousData,
        { transaction: mockTransaction },
      );
      expect(mockInventoryValueModel.update).not.toHaveBeenCalled();
      expect(newerVersion.destroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
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

      await VersionHistoryService.restoreVersion(targetVersion.versionId);

      expect(mockInventoryValueModel.destroy).toHaveBeenCalledWith({
        where: { id: entryId },
        transaction: mockTransaction,
      });
      expect(mockInventoryValueModel.update).not.toHaveBeenCalled();
      expect(newerVersion.destroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
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

      await VersionHistoryService.restoreVersion(targetVersion.versionId);

      expect(mockInventoryValueModel.destroy).toHaveBeenCalledWith({
        where: { id: entryId },
        transaction: mockTransaction,
      });
      expect(mockInventoryValueModel.update).not.toHaveBeenCalled();
      expect(newerVersion.destroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
    });

    it("should destroy every newer version record after processing", async () => {
      const targetVersion = createMockVersion();
      const previousData = { id: entryId, co2eq: 50 };

      const newerVersion1 = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId,
        table: "InventoryValue",
        previousVersion: { data: previousData, isDeleted: false },
      });
      const newerVersion2 = createMockVersion({
        inventoryId: targetVersion.inventoryId,
        entryId: randomUUID(),
        table: "InventoryValue",
        previousVersion: null,
      });

      mockVersionFindOne.mockResolvedValueOnce(targetVersion);
      mockVersionFindAll.mockResolvedValueOnce([
        newerVersion1,
        newerVersion2,
      ]);

      await VersionHistoryService.restoreVersion(targetVersion.versionId);

      expect(newerVersion1.destroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
      expect(newerVersion2.destroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
    });
  });
});
