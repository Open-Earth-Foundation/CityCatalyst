'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "ActivityValue"
      SET "activity_data_jsonb" = "activity_data"::jsonb
      WHERE "activity_data_jsonb" IS NULL; 
    `);
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "ActivityValue"
      SET "activity_data_jsonb" = NULL; 
    `);
  }
};
