"use strict";

const { parseJsonFile } = require("../seeders/util/util.cjs");

/**
 * CC-755: Admin-created modules sometimes duplicated seeded catalog entries
 * (same English name or URL, different UUID). Keep the canonical ids from
 * modules.json and remove the extras. User-created modules that are not in
 * the seed catalog are left unchanged.
 */
module.exports = {
  async up(queryInterface) {
    const seededModules = await parseJsonFile("modules", "modules");
    const seededIds = seededModules.map((module) => module.id);

    if (seededIds.length === 0) {
      return;
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      const seededValues = seededModules
        .map(
          (module) =>
            `('${module.id}'::uuid, ${queryInterface.sequelize.escape(
              module.name.en,
            )}, ${queryInterface.sequelize.escape(module.url)})`,
        )
        .join(",\n          ");

      await queryInterface.sequelize.query(
        `
          WITH seeded(id, name_en, url) AS (
            VALUES
              ${seededValues}
          ),
          duplicates AS (
            SELECT m.id AS duplicate_id, s.id AS canonical_id
            FROM "Module" m
            INNER JOIN seeded s
              ON m.name->>'en' = s.name_en OR m.url = s.url
            WHERE m.id <> s.id
          )
          UPDATE "ProjectModules" pm
          SET module_id = d.canonical_id,
              last_updated = CURRENT_TIMESTAMP
          FROM duplicates d
          WHERE pm.module_id = d.duplicate_id
            AND NOT EXISTS (
              SELECT 1
              FROM "ProjectModules" pm2
              WHERE pm2.project_id = pm.project_id
                AND pm2.module_id = d.canonical_id
            );
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
          WITH seeded(id, name_en, url) AS (
            VALUES
              ${seededValues}
          ),
          duplicates AS (
            SELECT m.id AS duplicate_id, s.id AS canonical_id
            FROM "Module" m
            INNER JOIN seeded s
              ON m.name->>'en' = s.name_en OR m.url = s.url
            WHERE m.id <> s.id
          )
          DELETE FROM "ProjectModules" pm
          USING duplicates d
          WHERE pm.module_id = d.duplicate_id;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
          WITH seeded(id, name_en, url) AS (
            VALUES
              ${seededValues}
          ),
          duplicates AS (
            SELECT m.id AS duplicate_id
            FROM "Module" m
            INNER JOIN seeded s
              ON m.name->>'en' = s.name_en OR m.url = s.url
            WHERE m.id <> s.id
          )
          DELETE FROM "Module" m
          USING duplicates d
          WHERE m.id = d.duplicate_id;
        `,
        { transaction },
      );
    });
  },

  async down() {
    // Duplicate module rows were removed after repointing ProjectModules;
    // restoring them would require a backup of deleted ids.
  },
};
