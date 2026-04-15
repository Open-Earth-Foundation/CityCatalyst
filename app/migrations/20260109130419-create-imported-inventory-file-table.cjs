"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ImportedInventoryFile", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "User",
          key: "user_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
      inventory_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Inventory",
          key: "inventory_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        // Sanitized file name for storage (e.g., special characters removed/replaced)
      },
      file_type: {
        type: Sequelize.ENUM("xlsx", "csv"),
        allowNull: false,
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      data: {
        type: Sequelize.BLOB,
        allowNull: true,
      },
      original_file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        // Original user-provided filename (preserved as-is)
      },
      import_status: {
        type: Sequelize.ENUM(
          "uploaded",
          "processing", // Combined validating + mapping step
          "waiting_for_approval",
          "approved",
          "importing", // Processing the import after approval
          "completed",
          "failed",
        ),
        allowNull: false,
        defaultValue: "uploaded",
      },
      mapping_configuration: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      validation_results: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      error_log: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      row_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      processed_row_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
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
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Create indexes
    await queryInterface.addIndex("ImportedInventoryFile", {
      fields: ["inventory_id"],
      name: "idx_imported_inventory_file_inventory_id",
    });

    await queryInterface.addIndex("ImportedInventoryFile", {
      fields: ["import_status"],
      name: "idx_imported_inventory_file_status",
    });

    await queryInterface.addIndex("ImportedInventoryFile", {
      fields: ["user_id"],
      name: "idx_imported_inventory_file_user_id",
    });

    await queryInterface.addIndex("ImportedInventoryFile", {
      fields: ["city_id"],
      name: "idx_imported_inventory_file_city_id",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ImportedInventoryFile");
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_ImportedInventoryFile_import_status";
      DROP TYPE IF EXISTS "enum_ImportedInventoryFile_file_type";
    `);
  },
};
