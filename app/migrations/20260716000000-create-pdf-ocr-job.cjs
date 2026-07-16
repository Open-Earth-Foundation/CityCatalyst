"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("PdfOcrJob", {
      source_type: { type: Sequelize.STRING(64), allowNull: false },
      source_id: { type: Sequelize.UUID, allowNull: false },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "queued",
      },
      attempt_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      run_after: { type: Sequelize.DATE, allowNull: true },
      model: { type: Sequelize.STRING(128), allowNull: true },
      page_count: { type: Sequelize.INTEGER, allowNull: true },
      result_s3_key: { type: Sequelize.STRING(1024), allowNull: true },
      result_size_bytes: { type: Sequelize.BIGINT, allowNull: true },
      result_sha256: { type: Sequelize.STRING(64), allowNull: true },
      lease_owner: { type: Sequelize.STRING(255), allowNull: true },
      lease_expires_at: { type: Sequelize.DATE, allowNull: true },
      heartbeat_at: { type: Sequelize.DATE, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      error_code: { type: Sequelize.STRING(128), allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      delivery_target: { type: Sequelize.STRING(64), allowNull: true },
      delivery_status: { type: Sequelize.STRING(32), allowNull: true },
      delivery_attempt_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      delivery_run_after: { type: Sequelize.DATE, allowNull: true },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      delivery_error_code: { type: Sequelize.STRING(128), allowNull: true },
      delivery_error_message: { type: Sequelize.TEXT, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["source_type", "source_id"],
      type: "primary key",
      name: "PdfOcrJob_pkey",
    });
    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["source_type"],
      type: "check",
      where: {
        source_type: {
          [Sequelize.Op.in]: ["inventory_import", "concept_note_upload"],
        },
      },
      name: "PdfOcrJob_source_type_check",
    });
    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["status"],
      type: "check",
      where: {
        status: {
          [Sequelize.Op.in]: ["queued", "running", "succeeded", "failed"],
        },
      },
      name: "PdfOcrJob_status_check",
    });
    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["delivery_target"],
      type: "check",
      where: {
        [Sequelize.Op.or]: [
          { delivery_target: null },
          { delivery_target: "climate_advisor" },
        ],
      },
      name: "PdfOcrJob_delivery_target_check",
    });
    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["delivery_status"],
      type: "check",
      where: {
        [Sequelize.Op.or]: [
          { delivery_status: null },
          {
            delivery_status: {
              [Sequelize.Op.in]: [
                "pending",
                "delivering",
                "delivered",
                "failed",
              ],
            },
          },
        ],
      },
      name: "PdfOcrJob_delivery_status_check",
    });
    await queryInterface.addIndex("PdfOcrJob", ["status", "run_after"], {
      name: "idx_pdf_ocr_job_due",
    });
    await queryInterface.addIndex("PdfOcrJob", ["status", "lease_expires_at"], {
      name: "idx_pdf_ocr_job_lease",
    });
    await queryInterface.addIndex(
      "PdfOcrJob",
      ["delivery_status", "delivery_run_after"],
      { name: "idx_pdf_ocr_job_delivery_due" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("PdfOcrJob");
  },
};
