"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("IngestDocument", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      content_hash: { type: Sequelize.STRING(64), allowNull: false },
      original_file_name: { type: Sequelize.STRING(512), allowNull: false },
      city_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "City", key: "city_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "Project", key: "project_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "Organization", key: "organization_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      uploaded_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      visibility: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "city",
      },
      markdown_ready: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      catalog_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "NativeInputCatalog", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      s3_key: { type: Sequelize.STRING(1024), allowNull: true },
      data: { type: Sequelize.BLOB, allowNull: true },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE "IngestDocument"
      ADD CONSTRAINT "IngestDocument_scope_check"
      CHECK (
        organization_id IS NOT NULL
        OR project_id IS NOT NULL
        OR city_id IS NOT NULL
      );
    `);
    await queryInterface.addIndex(
      "IngestDocument",
      ["content_hash", "city_id", "project_id", "organization_id"],
      { name: "idx_ingest_document_hash_scope" },
    );

    await queryInterface.addColumn("IngestItem", "document_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "IngestDocument", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("IngestItem", "document_id");
    await queryInterface.dropTable("IngestDocument");
  },
};
