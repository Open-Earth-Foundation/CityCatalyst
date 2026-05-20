"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProposedInventoryChange", {
      proposal_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      run_id: {
        type: Sequelize.UUID,
        allowNull: false,
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
      sector_code: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      subsector_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(48),
        allowNull: false,
      },
      recommended: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      alternatives: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      rationale: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      ui_message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      needs_user_choice: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      decision: {
        type: Sequelize.STRING(48),
        allowNull: true,
      },
      selected_source_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "DataSourceI18n",
          key: "datasource_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      selected_source_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      override_value: {
        type: Sequelize.DECIMAL,
        allowNull: true,
      },
      override_unit: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      decision_note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      decided_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "User",
          key: "user_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      decided_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      applied_inventory_value_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "InventoryValue",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("ProposedInventoryChange", {
      fields: ["inventory_id", "sector_code", "status"],
      name: "idx_proposed_inventory_change_inventory_sector_status",
    });

    await queryInterface.addIndex("ProposedInventoryChange", {
      fields: ["inventory_id", "subsector_code"],
      name: "idx_proposed_inventory_change_inventory_subsector",
    });

    await queryInterface.addIndex("ProposedInventoryChange", {
      fields: ["run_id"],
      name: "idx_proposed_inventory_change_run_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ProposedInventoryChange");
  },
};
