"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("HiapDemoFeedback", {
      id: { type: Sequelize.UUID, primaryKey: true },
      reviewer_name: { type: Sequelize.STRING, allowNull: true },
      organisation: { type: Sequelize.STRING, allowNull: true },
      kind: { type: Sequelize.STRING, allowNull: false },
      screen_id: { type: Sequelize.STRING, allowNull: true },
      section: { type: Sequelize.STRING, allowNull: true },
      category: { type: Sequelize.STRING, allowNull: true },
      priority: { type: Sequelize.STRING, allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      suggestion: { type: Sequelize.TEXT, allowNull: true },
      answers: { type: Sequelize.JSONB, allowNull: true },
      screenshots: { type: Sequelize.JSONB, allowNull: true },
      lang: { type: Sequelize.STRING, allowNull: true },
      created: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
    await queryInterface.addIndex("HiapDemoFeedback", ["created"], {
      name: "HiapDemoFeedback_created_index",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("HiapDemoFeedback");
  },
};
