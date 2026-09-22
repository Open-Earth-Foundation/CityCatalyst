import { describe, expect, it, jest } from "@jest/globals";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const migration = require("../migrations/20260922120000-add-structured-pdf-ocr-artifact.cjs");

describe("structured PDF OCR migration", () => {
  it("adds annotation mode and structured artifact columns, then rolls them back", async () => {
    const queryInterface = {
      addColumn: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      addConstraint: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      removeConstraint: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      removeColumn: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
    };
    const Sequelize = {
      STRING: (length: number) => `STRING(${length})`,
      BIGINT: "BIGINT",
      Op: { in: Symbol("in") },
    };

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      "PdfOcrJob",
      "annotation_mode",
      expect.objectContaining({
        allowNull: false,
        defaultValue: "none",
      }),
    );
    for (const column of [
      "structured_s3_key",
      "structured_size_bytes",
      "structured_sha256",
      "structured_schema_version",
    ]) {
      expect(queryInterface.addColumn).toHaveBeenCalledWith(
        "PdfOcrJob",
        column,
        expect.objectContaining({ allowNull: true }),
      );
    }
    expect(queryInterface.addConstraint).toHaveBeenCalledWith(
      "PdfOcrJob",
      expect.objectContaining({ name: "PdfOcrJob_annotation_mode_check" }),
    );

    await migration.down(queryInterface);
    expect(queryInterface.removeConstraint).toHaveBeenCalledWith(
      "PdfOcrJob",
      "PdfOcrJob_annotation_mode_check",
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledWith(
      "PdfOcrJob",
      "annotation_mode",
    );
  });
});
