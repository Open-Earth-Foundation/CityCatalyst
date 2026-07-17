import { describe, expect, it } from "@jest/globals";
import FileValidatorService, {
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
} from "@/backend/FileValidatorService";
import {
  INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
  INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "@/backend/InventoryImportFileLimits";
import { getPdfOcrConfig } from "@/backend/PdfOcrConfig";

describe("PDF source size limit", () => {
  it("shares one 20 MiB boundary across upload validation and OCR processing", () => {
    expect(INVENTORY_IMPORT_MAX_FILE_SIZE_MB).toBe(20);
    expect(INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_FILE_SIZE_MB).toBe(INVENTORY_IMPORT_MAX_FILE_SIZE_MB);
    expect(MAX_FILE_SIZE).toBe(INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES);
    expect(getPdfOcrConfig().maxSourcePdfBytes).toBe(
      INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    );

    expect(
      FileValidatorService.validateFileSize({
        size: INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
      } as File),
    ).toBe(true);
    expect(() =>
      FileValidatorService.validateFileSize({
        size: INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES + 1,
      } as File),
    ).toThrow("Maximum allowed size is 20MB");
  });
});
