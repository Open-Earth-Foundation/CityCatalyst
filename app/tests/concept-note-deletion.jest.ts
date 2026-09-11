import { beforeEach, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

const findAll = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const destroy = jest.fn<(...args: unknown[]) => Promise<number>>();
const deleteSource = jest.fn<(id: string) => Promise<void>>();
const transaction = { LOCK: { UPDATE: "UPDATE" } };
jest.unstable_mockModule("@/models", () => ({
  db: {
    sequelize: {
      transaction: async (callback: (t: typeof transaction) => Promise<void>) =>
        callback(transaction),
    },
    models: { PdfOcrJob: { findAll, destroy } },
  },
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { deleteConceptNoteSource: deleteSource },
}));
const { deleteConceptNoteSources } =
  await import("@/backend/ConceptNoteDeletionService");
beforeEach(() => {
  jest.clearAllMocks();
  findAll.mockResolvedValue([]);
  destroy.mockResolvedValue(1);
  deleteSource.mockResolvedValue();
});

test("removes source artifacts before OCR metadata and scopes to requested CNB identities", async () => {
  await deleteConceptNoteSources(["upload-1", "upload-2"]);
  expect(deleteSource.mock.calls).toEqual([["upload-1"], ["upload-2"]]);
  expect(destroy).toHaveBeenCalledWith({
    where: {
      sourceType: "concept_note_upload",
      sourceId: { [Op.in]: ["upload-1", "upload-2"] },
    },
    transaction,
  });
  expect(findAll).toHaveBeenCalledWith(
    expect.objectContaining({ lock: "UPDATE", transaction }),
  );
  expect(destroy.mock.invocationCallOrder[0]).toBeGreaterThan(
    deleteSource.mock.invocationCallOrder[1],
  );
});

test.each([
  { status: "queued" },
  { status: "running" },
  { status: "succeeded", deliveryStatus: "pending" },
  { status: "succeeded", deliveryStatus: "delivering" },
])("does not delete artifacts while a worker owns the job: %j", async (job) => {
  findAll.mockResolvedValue([job]);
  await expect(deleteConceptNoteSources(["upload-1"])).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(deleteSource).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
});

test.each([
  { status: "succeeded", deliveryStatus: "delivered" },
  { status: "failed", deliveryStatus: "failed" },
])("allows deletion after the pipeline stops: %j", async (job) => {
  findAll.mockResolvedValue([job]);
  await deleteConceptNoteSources(["upload-1"]);
  expect(deleteSource).toHaveBeenCalledWith("upload-1");
  expect(destroy).toHaveBeenCalledTimes(1);
});

test("keeps retry metadata on storage failure and permits a subsequent retry", async () => {
  deleteSource.mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(deleteConceptNoteSources(["upload-1"])).rejects.toThrow(
    "Storage unavailable",
  );
  expect(destroy).not.toHaveBeenCalled();
  await deleteConceptNoteSources(["upload-1"]);
  expect(destroy).toHaveBeenCalledTimes(1);
});
