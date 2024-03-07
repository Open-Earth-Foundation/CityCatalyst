"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint("City", "City_locode_key");
  },

  async down(queryInterface) {
    await queryInterface.addConstraint("City", {
      fields: ["locode"],
      type: "unique",
      name: "City_locode_key",
    });
  },
};
