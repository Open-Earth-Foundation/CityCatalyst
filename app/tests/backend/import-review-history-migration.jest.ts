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
  let admin: Sequelize;
  let db: Sequelize;
  const schema = `cc1201_test_${randomUUID().replace(/-/g, "")}`;

  // Fail closed: nothing below may run unless the connection is confined to
  // the throwaway schema, so `down` can never touch a real table in public.
  const assertIsolated = async () => {
    const [rows] = await db.query(
      "SELECT current_schema() AS current, current_schemas(true) AS visible",
    );
    const { current, visible } = rows[0] as {
      current: string;
      visible: string[];
    };
    if (current !== schema || visible.includes("public"))
      throw new Error(
        `Refusing to run: connection is not confined to ${schema} (${visible.join(",")})`,
      );
  };

  beforeAll(async () => {
    const isolatedPort = Number(process.env.CC1201_TEST_PG_PORT);
    if (!isolatedPort && process.env.CI !== "true")
      throw new Error(
        "CC1201_TEST_PG_PORT must identify an isolated test database",
      );
    const connection = {
      host: isolatedPort ? "127.0.0.1" : process.env.DATABASE_HOST,
      port: isolatedPort || 5432,
      dialect: "postgres" as const,
      logging: false,
    };
    const database = isolatedPort ? "citycatalyst" : process.env.DATABASE_NAME!;
    const user = isolatedPort ? "postgres" : process.env.DATABASE_USER!;
    const password = isolatedPort ? "localtest" : process.env.DATABASE_PASSWORD;
    // Only creates and drops the schema; it never runs migration code.
    admin = new Sequelize(database, user, password, {
      ...connection,
      pool: { max: 1, min: 0 },
    });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    // Every connection the pool ever opens starts with this search_path and
    // has no "public" in it, so a recycled connection stays isolated too.
    db = new Sequelize(database, user, password, {
      ...connection,
      pool: { max: 2, min: 0, idle: 60_000 },
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    await assertIsolated();
    await db.query(
      'CREATE TABLE "ImportedInventoryFile" (id integer PRIMARY KEY, status text)',
    );
    await db.query(
      "INSERT INTO \"ImportedInventoryFile\" VALUES (1, 'waiting')",
    );
  });

  afterAll(async () => {
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.close();
    }
    if (db) await db.close();
  });

  it("confines every pooled connection to the isolated schema", async () => {
    const schemas = await Promise.all(
      [0, 1].map(() =>
        db.transaction(async (transaction) => {
          await db.query("SELECT pg_sleep(0.2)", { transaction });
          const [rows] = await db.query(
            "SELECT current_schema() AS current, current_schemas(true) AS visible",
            { transaction },
          );
          return rows[0] as { current: string; visible: string[] };
        }),
      ),
    );
    for (const entry of schemas) {
      expect(entry.current).toBe(schema);
      expect(entry.visible).not.toContain("public");
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
    await assertIsolated();
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
    await assertIsolated();
    await migration.down(isolatedInterface, Sequelize);
    await assertIsolated();
    await migration.up(isolatedInterface, Sequelize);
    const [restored] = await db.query(
      'SELECT review_history FROM "ImportedInventoryFile" WHERE id = 1',
    );
    expect(restored).toEqual([{ review_history: null }]);
  });
});
