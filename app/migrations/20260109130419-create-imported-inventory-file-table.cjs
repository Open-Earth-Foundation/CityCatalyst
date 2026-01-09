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
      },
      file_type: {
        type: Sequelize.ENUM("xlsx", "csv"),
        allowNull: false,
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      file_path: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      original_file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      import_status: {
        type: Sequelize.ENUM(
          "uploaded",
          "validating",
          "mapping",
          "approved",
          "processing",
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
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
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
  },
};
