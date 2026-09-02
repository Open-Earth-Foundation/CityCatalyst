"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("MeedRanking", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      inventory_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Inventory", key: "inventory_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      input_digest: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      content_digest: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "running",
      },
      action_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      requested_languages: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      top_n: {
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
    });

    await queryInterface.addIndex("MeedRanking", ["inventory_id", "created"], {
      name: "MeedRanking_inventory_created",
    });

    await queryInterface.addColumn("MeedActionRanked", "ranking_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "MeedRanking", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("MeedActionRemoved", "ranking_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "MeedRanking", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("MeedActionRanked", ["ranking_id"], {
      name: "idx_meed_action_ranked_ranking_id",
    });
    await queryInterface.addIndex("MeedActionRemoved", ["ranking_id"], {
      name: "idx_meed_action_removed_ranking_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "MeedActionRanked",
      "idx_meed_action_ranked_ranking_id",
    );
    await queryInterface.removeIndex(
      "MeedActionRemoved",
      "idx_meed_action_removed_ranking_id",
    );
    await queryInterface.removeColumn("MeedActionRanked", "ranking_id");
    await queryInterface.removeColumn("MeedActionRemoved", "ranking_id");
    await queryInterface.removeIndex(
      "MeedRanking",
      "MeedRanking_inventory_created",
    );
    await queryInterface.dropTable("MeedRanking");
  },
};
