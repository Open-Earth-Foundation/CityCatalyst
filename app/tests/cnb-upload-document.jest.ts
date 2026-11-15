import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const documentId = "33333333-3333-4333-8333-333333333333";
type Row = Record<string, unknown>;
const findAssociation = jest.fn<() => Promise<Row | null>>();
const findDocument = jest.fn<() => Promise<Row | null>>();
const findCatalog = jest.fn<() => Promise<Row | null>>();
const updateDocument = jest.fn<() => Promise<void>>();
const updateCatalog = jest.fn<() => Promise<void>>();
const updateAssociations = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      NativeInputCatalog: {
        findOne: findAssociation,
        findByPk: findCatalog,
        update: updateAssociations,
      },
      IngestDocument: { findByPk: findDocument },
    },
  },
}));
let helpers: typeof import("@/backend/ingest/cnb-path-b");
let document: Row;
let catalog: Row;
beforeAll(async () => {
  helpers = await import("@/backend/ingest/cnb-path-b");
});
beforeEach(() => {
  jest.clearAllMocks();
  document = {
    id: documentId,
    catalogId: "primary",
    visibility: "run",
    markdownReady: false,
    update: updateDocument,
  };
  catalog = { availability: "active", update: updateCatalog };
  findAssociation.mockResolvedValue({ labels: { documentId } });
  findDocument.mockImplementation(async () => document);
  findCatalog.mockImplementation(async () => catalog);
  updateDocument.mockResolvedValue(undefined);
  updateCatalog.mockResolvedValue(undefined);
  updateAssociations.mockResolvedValue(undefined);
});
describe("CNB upload sharing metadata and verified OCR readiness", () => {
  it("reads the stable document identity and current visibility after promotion", async () => {
    await expect(
      helpers.loadConceptNoteUploadDocument("upload"),
    ).resolves.toEqual({ documentId, visibility: "run" });
    document.visibility = "city";
    await expect(
      helpers.loadConceptNoteUploadDocument("upload"),
    ).resolves.toEqual({ documentId, visibility: "city" });
  });
  it("omits unavailable legacy pool metadata", async () => {
    findAssociation.mockResolvedValueOnce(null);
    await expect(
      helpers.loadConceptNoteUploadDocument("legacy"),
    ).resolves.toEqual({});
    findAssociation.mockResolvedValueOnce({
      labels: { documentId: "invalid" },
    });
    await expect(
      helpers.loadConceptNoteUploadDocument("legacy"),
    ).resolves.toEqual({});
    findDocument.mockResolvedValueOnce(null);
    await expect(
      helpers.loadConceptNoteUploadDocument("legacy"),
    ).resolves.toEqual({});
  });
  it("marks the existing pool document, primary catalog and upload associations ready", async () => {
    await helpers.markConceptNoteDocumentMarkdownReady("upload");
    expect(updateDocument).toHaveBeenCalledWith({ markdownReady: true });
    expect(updateCatalog).toHaveBeenCalledWith({ markdownReady: true });
    expect(updateAssociations).toHaveBeenCalledWith(
      { markdownReady: true },
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "cnb_upload",
          availability: "active",
        }),
      }),
    );
  });
  it.each([
    ["withdrawn", { withdrawnAt: new Date() }, {}],
    ["purged", { bytesPurgedAt: new Date() }, {}],
    ["superseded", {}, { availability: "superseded" }],
  ])(
    "does not revive %s source metadata",
    async (_label, sourceChanges, catalogChanges) => {
      Object.assign(document, sourceChanges);
      Object.assign(catalog, catalogChanges);
      await helpers.markConceptNoteDocumentMarkdownReady("upload");
      expect(updateDocument).not.toHaveBeenCalled();
      expect(updateAssociations).not.toHaveBeenCalled();
    },
  );
});
