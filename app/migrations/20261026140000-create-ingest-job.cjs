"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("IngestJob", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      module_id: { type: Sequelize.STRING(32), allowNull: false },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "pending",
      },
      dry_run: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      visibility: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "city",
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "Organization", key: "organization_id" },
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
      city_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "City", key: "city_id" },
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
      total_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      completed_count: {
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
      awaiting_review_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error_code: { type: Sequelize.STRING(64), allowNull: true },
      error_log: { type: Sequelize.TEXT, allowNull: true },
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

    await queryInterface.addConstraint("IngestJob", {
      fields: ["status"],
      type: "check",
      where: {
        status: {
          [Sequelize.Op.in]: [
            "pending",
            "running",
            "awaiting_review",
            "completed",
            "failed",
            "cancelled",
          ],
        },
      },
      name: "IngestJob_status_check",
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE "IngestJob"
      ADD CONSTRAINT "IngestJob_scope_check"
      CHECK (
        organization_id IS NOT NULL
        OR project_id IS NOT NULL
        OR city_id IS NOT NULL
      );
    `);
    await queryInterface.addIndex("IngestJob", ["status"], {
      name: "idx_ingest_job_status",
    });
    await queryInterface.addIndex("IngestJob", ["city_id", "created"], {
      name: "idx_ingest_job_city_created",
    });

    await queryInterface.createTable("IngestItem", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "IngestJob", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      original_file_name: { type: Sequelize.STRING(512), allowNull: false },
      content_hash: { type: Sequelize.STRING(64), allowNull: true },
      s3_key: { type: Sequelize.STRING(1024), allowNull: true },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "pending",
      },
      stage: { type: Sequelize.STRING(32), allowNull: true },
      error_code: { type: Sequelize.STRING(64), allowNull: true },
      error_log: { type: Sequelize.TEXT, allowNull: true },
      warnings: { type: Sequelize.JSONB, allowNull: true },
      target_city_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "City", key: "city_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      target_inventory_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "Inventory", key: "inventory_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      coverage_years: { type: Sequelize.JSONB, allowNull: true },
      result: { type: Sequelize.JSONB, allowNull: true },
      review_draft: { type: Sequelize.JSONB, allowNull: true },
      review_locked_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      review_locked_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addConstraint("IngestItem", {
      fields: ["status"],
      type: "check",
      where: {
        status: {
          [Sequelize.Op.in]: [
            "pending",
            "running",
            "awaiting_review",
            "completed",
            "failed",
            "skipped",
          ],
        },
      },
      name: "IngestItem_status_check",
    });
    await queryInterface.addIndex("IngestItem", ["job_id", "status"], {
      name: "idx_ingest_item_job_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("IngestItem");
    await queryInterface.dropTable("IngestJob");
  },
};
