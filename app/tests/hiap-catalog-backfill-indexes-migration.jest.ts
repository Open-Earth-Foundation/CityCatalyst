import { describe, expect, it } from "@jest/globals";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const loadCjs = createRequire(import.meta.url);
const migrationPath = resolve(
  process.cwd(),
  "migrations/20260825120000-add-hiap-catalog-backfill-indexes.cjs",
);

describe("HIAP catalog backfill indexes migration", () => {
  it("creates concurrent indexes for the ranking page join and keyset order", async () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = loadCjs(migrationPath) as {
      up: (queryInterface: {
        sequelize: { query: (sql: string) => Promise<void> };
      }) => Promise<void>;
      down: (queryInterface: {
        sequelize: { query: (sql: string) => Promise<void> };
      }) => Promise<void>;
    };
    const queries: string[] = [];
    const queryInterface = {
      sequelize: {
        query: async (sql: string) => {
          queries.push(sql);
        },
      },
    };

    await migration.up(queryInterface);

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS");
    expect(queries[0]).toContain("idx_hiap_ranked_hia_ranking_id");
    expect(queries[0]).toContain('"HighImpactActionRanked" (hia_ranking_id)');
    expect(queries[1]).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS");
    expect(queries[1]).toContain("idx_hiap_ranking_success_created_id");
    expect(queries[1]).toContain(
      '"HighImpactActionRanking" (status, created, id)',
    );
    expect(queries[1]).toContain("WHERE status = 'SUCCESS'");

    queries.length = 0;
    await migration.down(queryInterface);

    expect(queries).toEqual([
      expect.stringContaining(
        "DROP INDEX CONCURRENTLY IF EXISTS idx_hiap_ranking_success_created_id",
      ),
      expect.stringContaining(
        "DROP INDEX CONCURRENTLY IF EXISTS idx_hiap_ranked_hia_ranking_id",
      ),
    ]);
  });
});
