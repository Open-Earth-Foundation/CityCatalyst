import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Sequelize } from "sequelize";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const require = createRequire(import.meta.url);
const migration = require("../../migrations/20261103000000-add-import-review-history.cjs");

const describeWithDatabase =
  process.env.CC1201_TEST_PG_PORT || process.env.CI === "true"
    ? describe
    : describe.skip;

describeWithDatabase("import review history migration", () => {
  let db: Sequelize;
  const schema = `cc1201_test_${randomUUID().replace(/-/g, "")}`;

  beforeAll(async () => {
    const isolatedPort = Number(process.env.CC1201_TEST_PG_PORT);
    if (!isolatedPort && process.env.CI !== "true")
      throw new Error(
        "CC1201_TEST_PG_PORT must identify an isolated test database",
      );
    db = new Sequelize(
      isolatedPort ? "citycatalyst" : process.env.DATABASE_NAME!,
      isolatedPort ? "postgres" : process.env.DATABASE_USER!,
      isolatedPort ? "localtest" : process.env.DATABASE_PASSWORD,
      {
        host: isolatedPort ? "127.0.0.1" : process.env.DATABASE_HOST,
        port: isolatedPort || 5432,
        dialect: "postgres",
        logging: false,
        pool: { max: 1, min: 0 },
      },
    );
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    await db.query(
      'CREATE TABLE "ImportedInventoryFile" (id integer PRIMARY KEY, status text)',
    );
    await db.query(
      "INSERT INTO \"ImportedInventoryFile\" VALUES (1, 'waiting')",
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.close();
    }
  });

  it("preserves history across normal updates and rejects direct overwrite or clearing", async () => {
    const queryInterface = db.getQueryInterface();
    const addColumn = queryInterface.addColumn.bind(queryInterface);
    const removeColumn = queryInterface.removeColumn.bind(queryInterface);
    const isolatedInterface = {
      sequelize: db,
      addColumn: (
        _table: string,
        column: string,
        definition: unknown,
        options: object,
      ) =>
        addColumn(
          { tableName: "ImportedInventoryFile", schema },
          column,
          definition as never,
          options,
        ),
      removeColumn: (_table: string, column: string, options: object) =>
        removeColumn(
          { tableName: "ImportedInventoryFile", schema },
          column,
          options,
        ),
    };
    await migration.up(isolatedInterface, Sequelize);
    const [existing] = await db.query(
      'SELECT review_history FROM "ImportedInventoryFile" WHERE id = 1',
    );
    expect(existing).toEqual([{ review_history: null }]);
    await expect(
      db.transaction(async (transaction) => {
        await db.query(
          'UPDATE "ImportedInventoryFile" SET review_history = \'{"version":1}\'::jsonb WHERE id = 1',
          { transaction },
        );
        throw new Error("simulate failed import");
      }),
    ).rejects.toThrow("simulate failed import");
    const [afterRollback] = await db.query(
      'SELECT review_history FROM "ImportedInventoryFile" WHERE id = 1',
    );
    expect(afterRollback).toEqual([{ review_history: null }]);
    await db.query(
      'UPDATE "ImportedInventoryFile" SET review_history = \'{"version":1}\'::jsonb WHERE id = 1',
    );
    await db.query(
      "UPDATE \"ImportedInventoryFile\" SET status = 'completed' WHERE id = 1",
    );
    await expect(
      db.query(
        'UPDATE "ImportedInventoryFile" SET review_history = \'{"version":2}\'::jsonb WHERE id = 1',
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        'UPDATE "ImportedInventoryFile" SET review_history = NULL WHERE id = 1',
      ),
    ).rejects.toThrow();
    const [rows] = await db.query(
      'SELECT status, review_history FROM "ImportedInventoryFile" WHERE id = 1',
    );
    expect(rows).toEqual([
      { status: "completed", review_history: { version: 1 } },
    ]);
    await migration.down(isolatedInterface, Sequelize);
    await migration.up(isolatedInterface, Sequelize);
    const [restored] = await db.query(
      'SELECT review_history FROM "ImportedInventoryFile" WHERE id = 1',
    );
    expect(restored).toEqual([{ review_history: null }]);
  });
});
