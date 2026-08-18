"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MEED_MODULE_ID = "9f622243-fba8-4f32-a000-ce6e66982bd1";

/**
 * Registers the Actions & Plans v2 (MEED) module row.
 *
 * This is a migration rather than a seeder on purpose. Module rows are normally
 * seeded from seed-data/modules/modules.json, but deployments only run
 * `npm run db:migrate` (see k8s/cc-migrate.yml) — seeders never execute there.
 * That left the module absent in deployed environments, so the admin panel had
 * nothing to grant and the module could not be enabled for a project at all.
 *
 * Values are read from the same seed file rather than duplicated here, so the
 * two cannot drift. Idempotent: inserts when missing, refreshes the display
 * fields when present, so it is safe on a database where the modules seeder has
 * already created the row.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const file = path.join(
      __dirname,
      "..",
      "seed-data",
      "modules",
      "modules.json",
    );
    const modules = JSON.parse(fs.readFileSync(file, "utf8"));
    const meed = modules.find((m) => m.id === MEED_MODULE_ID);

    if (!meed) {
      console.warn(
        `Module ${MEED_MODULE_ID} not present in seed data; skipping registration.`,
      );
      return;
    }

    await queryInterface.sequelize.query(
      `INSERT INTO "Module"
         (id, type, stage, name, description, tagline, author, url, status, created, last_updated)
       VALUES
         (:id, :type, :stage, :name, :description, :tagline, :author, :url, :status, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name          = EXCLUDED.name,
         description   = EXCLUDED.description,
         tagline       = EXCLUDED.tagline,
         url           = EXCLUDED.url,
         stage         = EXCLUDED.stage,
         status        = EXCLUDED.status,
         last_updated  = NOW()`,
      {
        replacements: {
          id: meed.id,
          type: meed.type,
          stage: meed.stage,
          name: JSON.stringify(meed.name),
          description: JSON.stringify(meed.description),
          tagline: JSON.stringify(meed.tagline),
          author: meed.author,
          url: meed.url,
          status: meed.status ?? "active",
        },
      },
    );
  },

  async down(queryInterface) {
    // Grants reference the module, so they go first.
    await queryInterface.sequelize.query(
      `DELETE FROM "ProjectModules" WHERE module_id = :id`,
      { replacements: { id: MEED_MODULE_ID } },
    );
    await queryInterface.sequelize.query(`DELETE FROM "Module" WHERE id = :id`, {
      replacements: { id: MEED_MODULE_ID },
    });
  },
};
