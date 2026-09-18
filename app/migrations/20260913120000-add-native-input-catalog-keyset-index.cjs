"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex(
      "NativeInputCatalog",
      ["availability", "created", "id"],
      {
        name: "idx_native_input_catalog_availability_created_id",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "NativeInputCatalog",
      "idx_native_input_catalog_availability_created_id",
    );
  },
};
