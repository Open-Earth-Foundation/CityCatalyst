"use strict";

const DEFAULT_PROJECT_ID = "ebe82f61-b51b-4015-90ef-8b94f86fb0b7";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkUpdate(
      "City",
      {
        project_id: DEFAULT_PROJECT_ID,
        last_updated: new Date(),
      },
      {
        project_id: null, // Assuming cities without projects have NULL project_id
      },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkUpdate(
      "City",
      {
        project_id: null,
        last_updated: new Date(),
      },
      {
        project_id: DEFAULT_PROJECT_ID,
      },
    );
  },
};
