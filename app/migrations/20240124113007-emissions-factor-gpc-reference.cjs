"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn(
      "EmissionsFactor",
      "gpc_refno",
      "gpc_reference_number",
    );
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      "EmissionsFactor",
      "gpc_reference_number",
      "gpc_refno"
    );
  },
};
