"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM public."EmissionsFactor" WHERE inventory_id IS NULL`,
    );
  },
  async down() {},
};
