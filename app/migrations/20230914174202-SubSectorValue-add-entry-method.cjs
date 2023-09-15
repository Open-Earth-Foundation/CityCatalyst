"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("SubSectorValue", "entry_method", {
      type: Sequelize.DataTypes.STRING,
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn("SubSectorValue", "entry_method");
  },
};
