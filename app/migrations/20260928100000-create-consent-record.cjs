"use strict";

/**
 * Server-side consent ledger, plus last_active_at so later retention can
 * tell an inactive account from one that only changed its profile.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("User", "last_active_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("User", ["last_active_at"], {
      name: "User_last_active_at_idx",
    });

    await queryInterface.createTable("ConsentRecord", {
      consent_record_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      subject_key: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      consent_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      policy_version: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      source: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      ip_address: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE "ConsentRecord"
      ADD CONSTRAINT "ConsentRecord_subject_present"
      CHECK (user_id IS NOT NULL OR subject_key IS NOT NULL)
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ConsentRecord"
      ADD CONSTRAINT "ConsentRecord_status_check"
      CHECK (status IN ('granted', 'withdrawn'))
    `);
    await queryInterface.addIndex("ConsentRecord", ["user_id"], {
      name: "ConsentRecord_user_id_idx",
    });
    await queryInterface.addIndex("ConsentRecord", ["subject_key"], {
      name: "ConsentRecord_subject_key_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ConsentRecord");
    await queryInterface.removeIndex("User", "User_last_active_at_idx");
    await queryInterface.removeColumn("User", "last_active_at");
  },
};
