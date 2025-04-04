"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM public."EmissionsFactor" WHERE inventory_id IS NULL`,
    );
  },
  async down(queryInterface, Sequelize) {},
};
