"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // the previous migration was edited after being deployed, so make sure this column is renamed
    try {
      await queryInterface.renameColumn(
        "OrganizationInvite",
        "created_at",
        "created",
      );
      await queryInterface.renameColumn(
        "OrganizationInvite",
        "updated_at",
        "last_updated",
      );
    } catch (error) {
      console.error(error);
    }
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      "OrganizationInvite",
      "created",
      "created_at",
    );
    await queryInterface.renameColumn(
      "OrganizationInvite",
      "last_updated",
      "updated_at",
    );
  },
};
