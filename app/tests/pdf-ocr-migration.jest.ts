import { describe, expect, it, jest } from "@jest/globals";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const migration = require("../migrations/20260716000000-create-pdf-ocr-job.cjs");

describe("PdfOcrJob migration", () => {
  it("creates the composite queue schema and all due-work indexes, then drops it", async () => {
    const queryInterface = {
      createTable: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      addConstraint: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      addIndex: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
      dropTable: jest
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
    };
    const scalar = (name: string) => jest.fn(() => name);
    const Sequelize = {
      STRING: scalar("STRING"),
      UUID: "UUID",
      INTEGER: "INTEGER",
      DATE: "DATE",
      BIGINT: "BIGINT",
      TEXT: "TEXT",
      fn: jest.fn(() => "NOW"),
      Op: { in: Symbol("in"), or: Symbol("or") },
    };

    await migration.up(queryInterface, Sequelize);
    expect(queryInterface.createTable).toHaveBeenCalledWith(
      "PdfOcrJob",
      expect.objectContaining({
        source_type: expect.objectContaining({ allowNull: false }),
        source_id: expect.objectContaining({ allowNull: false }),
        lease_expires_at: expect.anything(),
        result_s3_key: expect.anything(),
        delivery_status: expect.anything(),
      }),
    );
    expect(queryInterface.addConstraint).toHaveBeenCalledWith(
      "PdfOcrJob",
      expect.objectContaining({
        fields: ["source_type", "source_id"],
        type: "primary key",
      }),
    );
    const indexNames = queryInterface.addIndex.mock.calls.map(
      (call) =>
        (call as unknown as [string, string[], { name: string }])[2].name,
    );
    expect(indexNames).toEqual([
      "idx_pdf_ocr_job_due",
      "idx_pdf_ocr_job_lease",
      "idx_pdf_ocr_job_delivery_due",
    ]);

    await migration.down(queryInterface);
    expect(queryInterface.dropTable).toHaveBeenCalledWith("PdfOcrJob");
  });
});
