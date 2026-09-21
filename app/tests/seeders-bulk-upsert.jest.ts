import { describe, expect, it } from "@jest/globals";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const loadCjs = createRequire(import.meta.url);
const utilPath = resolve(process.cwd(), "seeders/util/util.cjs");

type QueryOptions = { transaction?: unknown };

function makeQueryInterface(rows: Record<string, unknown>[]) {
  const bulkInsertCalls: unknown[] = [];
  const bulkUpdateCalls: unknown[] = [];

  return {
    bulkInsertCalls,
    bulkUpdateCalls,
    queryInterface: {
      sequelize: {
        query: async (sql: string, _options?: QueryOptions) => {
          if (sql.startsWith("SELECT COUNT(*)")) {
            const idMatch = sql.match(/"id" = '([^']+)'/);
            const id = idMatch?.[1];
            const exists = rows.some((row) => row.id === id);
            return [[{ count: exists ? "1" : "0" }]];
          }
          const columnMatch = sql.match(/^SELECT "([^"]+)" FROM/);
          const idMatch = sql.match(/"id" = '([^']+)'/);
          if (columnMatch && idMatch) {
            const column = columnMatch[1];
            const row = rows.find((r) => r.id === idMatch[1]);
            return [[{ [column]: row?.[column] }]];
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        QueryTypes: { SELECT: "SELECT" },
      },
      bulkInsert: async (
        tableName: string,
        entries: unknown[],
        options?: QueryOptions,
      ) => {
        bulkInsertCalls.push({ tableName, entries, options });
      },
      bulkUpdate: async (
        tableName: string,
        entry: unknown,
        whereClause: unknown,
        options?: QueryOptions,
      ) => {
        bulkUpdateCalls.push({ tableName, entry, whereClause, options });
      },
    },
  };
}

describe("bulkUpsert protectColumn", () => {
  it("skips updating rows where the protect column is true", async () => {
    const { bulkUpsert } = loadCjs(utilPath) as {
      bulkUpsert: (
        queryInterface: unknown,
        tableName: string,
        entries: Record<string, unknown>[],
        idColumnName: string,
        transaction: unknown,
        debug?: boolean,
        insertTimestampsOnCreate?: boolean,
        protectColumn?: string | null,
      ) => Promise<void>;
    };

    const { queryInterface, bulkUpdateCalls, bulkInsertCalls } =
      makeQueryInterface([
        { id: "protected-1", is_manually_edited: true },
        { id: "unprotected-1", is_manually_edited: false },
      ]);

    await bulkUpsert(
      queryInterface,
      "Module",
      [
        { id: "protected-1", stage: "new-value" },
        { id: "unprotected-1", stage: "new-value" },
        { id: "new-row", stage: "new-value" },
      ],
      "id",
      undefined,
      false,
      false,
      "is_manually_edited",
    );

    expect(bulkUpdateCalls).toHaveLength(1);
    expect(
      (bulkUpdateCalls[0] as { whereClause: { id: string } }).whereClause.id,
    ).toBe("unprotected-1");

    expect(bulkInsertCalls).toHaveLength(1);
    expect(
      (bulkInsertCalls[0] as { entries: { id: string }[] }).entries[0].id,
    ).toBe("new-row");
  });

  it("updates every existing row when no protect column is given", async () => {
    const { bulkUpsert } = loadCjs(utilPath) as {
      bulkUpsert: (
        queryInterface: unknown,
        tableName: string,
        entries: Record<string, unknown>[],
        idColumnName: string,
        transaction: unknown,
      ) => Promise<void>;
    };

    const { queryInterface, bulkUpdateCalls } = makeQueryInterface([
      { id: "row-1", is_manually_edited: true },
    ]);

    await bulkUpsert(
      queryInterface,
      "Module",
      [{ id: "row-1", stage: "new-value" }],
      "id",
      undefined,
    );

    expect(bulkUpdateCalls).toHaveLength(1);
  });
});
