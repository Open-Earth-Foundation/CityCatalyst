"use strict";

/** Keep hash/scope deduplication inside each private actor's immutable origin. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "IngestDocument",
        "private_owner_id",
        {
          type: Sequelize.UUID,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        UPDATE "IngestDocument"
        SET private_owner_id = uploaded_by_user_id
        WHERE visibility = 'run';
        DROP INDEX "idx_ingest_document_hash_scope";
        CREATE UNIQUE INDEX "idx_ingest_document_hash_scope"
        ON "IngestDocument" (content_hash, city_id, project_id, organization_id, private_owner_id)
        NULLS NOT DISTINCT WHERE withdrawn_at IS NULL;
      `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Duplicate private origins must be resolved explicitly before downgrading.
      // Index creation fails transactionally instead of dropping or merging data.
      await queryInterface.sequelize.query(
        `
        DROP INDEX "idx_ingest_document_hash_scope";
        CREATE UNIQUE INDEX "idx_ingest_document_hash_scope"
        ON "IngestDocument" (content_hash, city_id, project_id, organization_id)
        NULLS NOT DISTINCT WHERE withdrawn_at IS NULL;
      `,
        { transaction },
      );
      await queryInterface.removeColumn("IngestDocument", "private_owner_id", {
        transaction,
      });
    });
  },
};
