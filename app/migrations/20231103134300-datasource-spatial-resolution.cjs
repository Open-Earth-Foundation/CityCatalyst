"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn(
      "DataSource",
      "spacial_resolution",
      "spatial_resolution",
    );
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      "DataSource",
      "spatial_resolution",
      "spacial_resolution",
    );
  },
};
