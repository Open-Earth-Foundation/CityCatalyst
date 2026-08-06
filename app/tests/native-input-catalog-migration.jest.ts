import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const migration = require("../migrations/20260806120000-create-native-input-catalog.cjs") as {
  up: (queryInterface: unknown, Sequelize: unknown) => Promise<void>;
  down: (queryInterface: unknown) => Promise<void>;
};

const queryInterface = {
  addConstraint: jest.fn().mockResolvedValue(undefined),
  addIndex: jest.fn().mockResolvedValue(undefined),
  createTable: jest.fn().mockResolvedValue(undefined),
  dropTable: jest.fn().mockResolvedValue(undefined),
  sequelize: {
    query: jest.fn().mockResolvedValue(undefined),
  },
};

const Sequelize = {
  BOOLEAN: "BOOLEAN",
  DATE: "DATE",
  JSONB: "JSONB",
  Op: { in: "IN" },
  STRING: (length: number) => `STRING(${length})`,
  UUID: "UUID",
  UUIDV4: "UUIDV4",
  fn: (name: string) => `fn(${name})`,
};

describe("NativeInputCatalog migration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates the pointer table, lifecycle constraint, and lookup indexes", async () => {
    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      "NativeInputCatalog",
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true }),
        source_type: expect.any(Object),
        source_id: expect.any(Object),
        availability: expect.objectContaining({ defaultValue: "active" }),
      }),
    );
    expect(queryInterface.addConstraint).toHaveBeenCalledWith(
      "NativeInputCatalog",
      expect.objectContaining({
        fields: ["availability"],
        type: "check",
        name: "NativeInputCatalog_availability_check",
      }),
    );
    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE UNIQUE INDEX "NativeInputCatalog_source_identity_active_key"',
      ),
    );
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(6);
  });

  it("removes the partial identity index before dropping the table", async () => {
    await migration.down(queryInterface);

    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "NativeInputCatalog_source_identity_active_key";',
    );
    expect(queryInterface.dropTable).toHaveBeenCalledWith("NativeInputCatalog");
  });
});
