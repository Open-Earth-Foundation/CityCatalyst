"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("PdfOcrJob", "annotation_mode", {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: "none",
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_s3_key", {
      type: Sequelize.STRING(1024),
      allowNull: true,
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_size_bytes", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_sha256", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_schema_version", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["annotation_mode"],
      type: "check",
      where: {
        annotation_mode: { [Sequelize.Op.in]: ["none", "visual_context"] },
      },
      name: "PdfOcrJob_annotation_mode_check",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "PdfOcrJob",
      "PdfOcrJob_annotation_mode_check",
    );
    await queryInterface.removeColumn("PdfOcrJob", "structured_schema_version");
    await queryInterface.removeColumn("PdfOcrJob", "structured_sha256");
    await queryInterface.removeColumn("PdfOcrJob", "structured_size_bytes");
    await queryInterface.removeColumn("PdfOcrJob", "structured_s3_key");
    await queryInterface.removeColumn("PdfOcrJob", "annotation_mode");
  },
};
