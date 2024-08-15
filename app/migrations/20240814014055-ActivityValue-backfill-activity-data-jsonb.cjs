'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE "ActivityValue"
      SET "activity_data_jsonb" = "activity_data"::jsonb
      WHERE "activity_data_jsonb" IS NULL; 
    `);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE "ActivityValue"
      SET "activity_data_jsonb" = NULL; 
    `);
  }
};
