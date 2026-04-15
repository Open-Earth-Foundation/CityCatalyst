"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ImportMappingFeedback", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      city_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "City",
          key: "city_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Plain sorted pipe-joined normalised header string — readable + debuggable.
      // TEXT to accommodate wide-year files with many columns.
      header_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // Which adapter family processed this file (long-tidy, wide-year, multi-sheet, near-ecrf, ciris, biomatec, ecrf, pdf)
      adapter_type: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      // Map of original column header → ExtractedRow field name
      // e.g. { "SECTOR": "sector", "GHG_EMISSIONS": "totalCO2e" }
      column_mapping: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      // 2–5 representative ExtractedRow objects for use as prompt examples
      example_rows: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Primary lookup: city + header key (unique — one record per city × file structure)
    await queryInterface.addIndex("ImportMappingFeedback", {
      fields: ["city_id", "header_key"],
      name: "idx_import_mapping_feedback_city_header",
      unique: true,
    });

    await queryInterface.addIndex("ImportMappingFeedback", {
      fields: ["city_id"],
      name: "idx_import_mapping_feedback_city_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ImportMappingFeedback");
  },
};
