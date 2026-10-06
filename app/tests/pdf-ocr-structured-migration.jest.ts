import { describe, expect, it, jest } from "@jest/globals";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const migration = require("../migrations/20260922120000-add-structured-pdf-ocr-artifact.cjs");

describe("structured PDF OCR migration", () => {
  it("adds annotation mode and structured artifact columns, then rolls them back", async () => {
    const query = jest
      .fn<(sql: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const queryInterface = {
      sequelize: { query },
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
    expect(query).toHaveBeenCalledWith(migration.IN_FLIGHT_CNB_ANNOTATION_SQL);
    expect(migration.IN_FLIGHT_CNB_ANNOTATION_SQL).toContain(
      "annotation_mode = 'visual_context'",
    );
    expect(migration.IN_FLIGHT_CNB_ANNOTATION_SQL).toContain(
      "status IN ('queued', 'running')",
    );
    expect(migration.IN_FLIGHT_CNB_ANNOTATION_SQL).toContain(
      "source_type = 'concept_note_upload'",
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

  it.each([
    ["inventory_import", "queued", null, "worker"],
    ["inventory_import", "running", null, "worker"],
    ["inventory_import", "failed", null, null],
    ["inventory_import", "succeeded", null, null],
    ["concept_note_upload", "failed", null, null],
    ["concept_note_upload", "succeeded", null, null],
    ["concept_note_upload", "succeeded", "direct_markdown", null],
  ] as const)(
    "leaves %s %s jobs readable at annotation mode none",
    (sourceType, status, model, leaseOwner) => {
      expect(
        migration.transitionExistingJob({
          sourceType,
          status,
          model,
          leaseOwner,
        }),
      ).toEqual({
        annotationMode: "none",
        status,
        leaseOwner,
      });
    },
  );

  it("requeues in-flight CNB PDF jobs onto visual context", () => {
    expect(
      migration.transitionExistingJob({
        sourceType: "concept_note_upload",
        status: "queued",
        model: null,
        leaseOwner: null,
      }),
    ).toEqual({
      annotationMode: "visual_context",
      status: "queued",
      leaseOwner: null,
    });
    expect(
      migration.transitionExistingJob({
        sourceType: "concept_note_upload",
        status: "running",
        model: null,
        leaseOwner: "worker",
      }),
    ).toEqual({
      annotationMode: "visual_context",
      status: "queued",
      leaseOwner: null,
    });
  });
});
