"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // remove duplicate modules GHGI and HIAP (without descriptions)
    await queryInterface.bulkDelete("Module", {
      id: "9295ad69-72c6-4b1c-b29d-b71f7b8ba8e8",
    });
    await queryInterface.bulkDelete("Module", {
      id: "072a53d6-cd58-4622-b4e4-4f482baa23b3",
    });
  },

  async down() {},
};
