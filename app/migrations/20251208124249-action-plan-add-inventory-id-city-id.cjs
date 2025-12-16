"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add inventory_id column
    await queryInterface.addColumn("ActionPlan", "inventory_id", {
      type: Sequelize.UUID,
      allowNull: true,
      comment: "Reference to the inventory",
    });

    // Add city_id column
    await queryInterface.addColumn("ActionPlan", "city_id", {
      type: Sequelize.UUID,
      allowNull: true,
      comment: "Reference to the city",
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove columns
    await queryInterface.removeColumn("ActionPlan", "inventory_id");
    await queryInterface.removeColumn("ActionPlan", "city_id");
  },
};
