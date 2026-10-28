"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("BulkInventoryImportJob", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Project", key: "project_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      year: { type: Sequelize.INTEGER, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "pending",
      },
      total_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      matched_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      imported_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failed_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skipped_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      s3_key: { type: Sequelize.STRING(1024), allowNull: true },
      dry_run: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      create_missing_cities: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      replace_existing: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
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

    await queryInterface.addConstraint("BulkInventoryImportJob", {
      fields: ["status"],
      type: "check",
      where: {
        status: {
          [Sequelize.Op.in]: [
            "pending",
            "matching",
            "importing",
            "completed",
            "failed",
            "cancelled",
          ],
        },
      },
      name: "BulkInventoryImportJob_status_check",
    });
    await queryInterface.addIndex(
      "BulkInventoryImportJob",
      ["project_id", "created"],
      { name: "idx_bulk_inventory_import_job_project_created" },
    );
    await queryInterface.addIndex("BulkInventoryImportJob", ["status"], {
      name: "idx_bulk_inventory_import_job_status",
    });

    await queryInterface.createTable("BulkInventoryImportItem", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "BulkInventoryImportJob", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      original_file_name: { type: Sequelize.STRING(512), allowNull: false },
      s3_key: { type: Sequelize.STRING(1024), allowNull: true },
      city_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "City", key: "city_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      inventory_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "Inventory", key: "inventory_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      locode: { type: Sequelize.STRING(32), allowNull: true },
      imported_file_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "ImportedInventoryFile", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      resolved_year: { type: Sequelize.INTEGER, allowNull: true },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "pending",
      },
      error_code: { type: Sequelize.STRING(64), allowNull: true },
      error_log: { type: Sequelize.TEXT, allowNull: true },
      warnings: { type: Sequelize.JSONB, allowNull: true },
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

    await queryInterface.addConstraint("BulkInventoryImportItem", {
      fields: ["status"],
      type: "check",
      where: {
        status: {
          [Sequelize.Op.in]: [
            "pending",
            "matched",
            "unmatched",
            "importing",
            "completed",
            "failed",
            "skipped",
          ],
        },
      },
      name: "BulkInventoryImportItem_status_check",
    });
    await queryInterface.addIndex(
      "BulkInventoryImportItem",
      ["job_id", "status"],
      { name: "idx_bulk_inventory_import_item_job_status" },
    );
    await queryInterface.addIndex("BulkInventoryImportItem", ["city_id"], {
      name: "idx_bulk_inventory_import_item_city_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("BulkInventoryImportItem");
    await queryInterface.dropTable("BulkInventoryImportJob");
  },
};
