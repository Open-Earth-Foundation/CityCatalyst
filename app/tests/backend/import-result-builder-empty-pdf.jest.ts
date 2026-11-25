/**
 * CC-1202: a PDF import with no extracted rows must not be parsed as CSV.
 * Before the fix, buildImportResult fell through to FileParserService.parseFile
 * with fileType "pdf", which threw a CsvError on the "%PDF-1.4" bytes.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const parseFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const resolveImportedFileBuffer =
  jest.fn<(...args: unknown[]) => Promise<Buffer | null>>();

jest.unstable_mockModule("@/backend/FileParserService", () => ({
  default: { parseFile },
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { resolveImportedFileBuffer },
}));
jest.unstable_mockModule("@/backend/ECRFImportService", () => ({
  default: {
    fromExtractedRows: jest.fn(),
    processECRFFile: jest.fn(),
  },
}));

const { buildImportResult } = await import("@/backend/ImportResultBuilder");

type ImportedFileArg = Parameters<typeof buildImportResult>[0];

describe("buildImportResult with an empty PDF extraction", () => {
  beforeEach(() => {
    parseFile.mockReset();
    resolveImportedFileBuffer.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  it("throws a clear error instead of parsing the PDF as CSV", async () => {
    const importedFile = {
      fileType: "pdf",
      mappingConfiguration: { rows: [] },
      validationResults: {},
    } as unknown as ImportedFileArg;

    await expect(buildImportResult(importedFile)).rejects.toThrow(
      "PDF import has no extracted rows",
    );
    expect(parseFile).not.toHaveBeenCalled();
  });
});
