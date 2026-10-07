"use strict";

/**
 * Log of retention actions. The scheduled job writes here; DSAR export reads
 * the rows that name a user.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("RetentionActionLog", {
      retention_action_log_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      policy_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      action: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      subject_type: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      subject_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      dry_run: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });
    await queryInterface.addIndex(
      "RetentionActionLog",
      ["subject_type", "subject_id"],
      { name: "RetentionActionLog_subject_idx" },
    );
    await queryInterface.addIndex("RetentionActionLog", ["policy_key"], {
      name: "RetentionActionLog_policy_key_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("RetentionActionLog");
  },
};
