"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create the ActionPlan table with the new structure
    await queryInterface.createTable("ActionPlan", {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      action_id: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "ID of the climate action (e.g., icare_0096)",
      },
      high_impact_action_ranked_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "Reference to the high impact action ranked",
      },
      city_locode: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "City location code (e.g., BR SER)",
      },
      action_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Name of the climate action",
      },
      language: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "en",
        comment: "Language of the action plan content",
      },

      // Plan metadata
      city_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Name of the city",
      },
      created_at_timestamp: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Timestamp when the plan was generated",
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "User ID who created the plan",
      },

      // Plan content - stored as JSONB for flexibility
      subactions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "List of sub-actions in the plan",
      },
      institutions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "List of institutions involved",
      },
      milestones: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "List of milestones for the plan",
      },
      timeline: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Timeline information for the plan",
      },
      cost_budget: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Cost and budget information",
      },
      mer_indicators: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Monitoring, evaluation, and reporting indicators",
      },
      mitigations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Mitigation measures",
      },
      adaptations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Adaptation measures",
      },
      sdgs: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Sustainable Development Goals alignment",
      },

      // Timestamps
      created: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      last_updated: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes for performance
    await queryInterface.addIndex("ActionPlan", ["action_id"]);
    await queryInterface.addIndex("ActionPlan", ["city_locode"]);
    await queryInterface.addIndex("ActionPlan", ["language"]);
    await queryInterface.addIndex("ActionPlan", ["created_by"]);
    await queryInterface.addIndex("ActionPlan", [
      "high_impact_action_ranked_id",
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ActionPlan");
  },
};
