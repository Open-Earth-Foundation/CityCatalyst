"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("NativeInputCatalog", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      kind: { type: Sequelize.STRING(64), allowNull: false },
      owning_module: { type: Sequelize.STRING(64), allowNull: false },
      source_type: { type: Sequelize.STRING(64), allowNull: false },
      source_id: { type: Sequelize.STRING(255), allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: true },
      inventory_id: { type: Sequelize.UUID, allowNull: true },
      city_id: { type: Sequelize.UUID, allowNull: true },
      project_id: { type: Sequelize.UUID, allowNull: true },
      organization_id: { type: Sequelize.UUID, allowNull: true },
      availability: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "active",
      },
      superseded_by_id: { type: Sequelize.UUID, allowNull: true },
      content_digest: { type: Sequelize.STRING(128), allowNull: true },
      markdown_ready: { type: Sequelize.BOOLEAN, allowNull: true },
      labels: { type: Sequelize.JSONB, allowNull: true },
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

    await queryInterface.addConstraint("NativeInputCatalog", {
      fields: ["availability"],
      type: "check",
      where: {
        availability: {
          [Sequelize.Op.in]: ["active", "withdrawn", "superseded"],
        },
      },
      name: "NativeInputCatalog_availability_check",
    });

    // Withdrawn rows remain auditable and may be replaced by a new source version.
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX "NativeInputCatalog_source_identity_active_key" ON "NativeInputCatalog" ("source_type", "source_id") WHERE "availability" <> \'withdrawn\';',
    );

    await queryInterface.addIndex("NativeInputCatalog", ["availability"], {
      name: "idx_native_input_catalog_availability",
    });
    for (const scope of [
      "user_id",
      "inventory_id",
      "city_id",
      "project_id",
      "organization_id",
    ]) {
      await queryInterface.addIndex(
        "NativeInputCatalog",
        [scope, "availability"],
        {
          name: `idx_native_input_catalog_${scope.replace("_id", "")}_availability`,
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "NativeInputCatalog_source_identity_active_key";',
    );
    await queryInterface.dropTable("NativeInputCatalog");
  },
};
