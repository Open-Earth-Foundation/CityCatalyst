"use strict";

const defaultProjectId = "ebe82f61-b51b-4015-90ef-8b94f86fb0b7";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.changeColumn("Project", "city_count_limit", {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.bulkUpdate(
      "Project",
      {
        city_count_limit: Number.MAX_SAFE_INTEGER,
        last_updated: new Date(),
      },
      {
        project_id: defaultProjectId, // Assuming cities without projects have NULL project_id
      },
    );
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */

    await queryInterface.changeColumn("Project", "city_count_limit", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.bulkUpdate(
      "Project",
      {
        city_count_limit: 99999,
        last_updated: new Date(),
      },
      {
        project_id: defaultProjectId,
      },
    );
  },
};
