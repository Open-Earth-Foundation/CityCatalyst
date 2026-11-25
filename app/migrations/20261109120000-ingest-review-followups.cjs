"use strict";

/** PR #3401 review: allow a fresh pool row after withdraw, and remember mixed GPC sources. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "idx_ingest_document_hash_scope";
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "idx_ingest_document_hash_scope"
      ON "IngestDocument" (
        "content_hash",
        "city_id",
        "project_id",
        "organization_id"
      )
      NULLS NOT DISTINCT
      WHERE withdrawn_at IS NULL;
    `);
    await queryInterface.addColumn("InventoryValue", "source_document_ids", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("InventoryValue", "source_document_ids");
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "idx_ingest_document_hash_scope";
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "idx_ingest_document_hash_scope"
      ON "IngestDocument" (
        "content_hash",
        "city_id",
        "project_id",
        "organization_id"
      )
      NULLS NOT DISTINCT;
    `);
  },
};
