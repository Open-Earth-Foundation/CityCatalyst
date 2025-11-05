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

      // Plan content - Introduction section
      city_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Description of the city context (from introduction)",
      },
      action_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Description of the climate action (from introduction)",
      },
      national_strategy_explanation: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment:
          "Explanation of relevant national strategy (from introduction)",
      },

      // Subactions as JSON array
      subactions: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of subaction items",
      },

      // Institutions as JSON array
      institutions: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of relevant institutions",
      },

      // Milestones as JSON array
      milestones: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of milestone items",
      },

      // Timeline as JSON array
      timeline: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of timeline items",
      },

      // Cost budget as JSON array
      cost_budget: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of cost budget items",
      },

      // MER indicators as JSON array
      mer_indicators: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of monitoring, evaluation, and reporting indicators",
      },

      // Mitigations as JSON array
      mitigations: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of mitigation measures",
      },

      // Adaptations as JSON array
      adaptations: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of adaptation measures",
      },

      // SDGs as JSON array
      sdgs: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of relevant Sustainable Development Goals",
      },

      // Tracking fields
      created_by: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "User ID who created this action plan",
      },
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

    // Add indexes for better query performance
    await queryInterface.addIndex("ActionPlan", ["action_id"], {
      name: "idx_action_plan_action_id",
    });

    await queryInterface.addIndex("ActionPlan", ["language"], {
      name: "idx_action_plan_language",
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop the ActionPlan table
    await queryInterface.dropTable("ActionPlan");
  },
};
