"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add a temporary column with UUID type
    await queryInterface.addColumn("CityInvite", "user_id_temp", {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // Copy data from user_id to user_id_temp
    await queryInterface.sequelize.query(
      'UPDATE "CityInvite" SET "user_id_temp" = "user_id"::uuid',
    );

    // Remove the old user_id column
    await queryInterface.removeColumn("CityInvite", "user_id");

    // Rename the temporary column to user_id
    await queryInterface.renameColumn("CityInvite", "user_id_temp", "user_id");
  },

  async down(queryInterface, Sequelize) {
    // Add a temporary column with STRING type
    await queryInterface.addColumn("CityInvite", "user_id_temp", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Copy data from user_id to user_id_temp
    await queryInterface.sequelize.query(
      'UPDATE "CityInvite" SET "user_id_temp" = "user_id"::text',
    );

    // Remove the old user_id column
    await queryInterface.removeColumn("CityInvite", "user_id");

    // Rename the temporary column to user_id
    await queryInterface.renameColumn("CityInvite", "user_id_temp", "user_id");
  },
};
