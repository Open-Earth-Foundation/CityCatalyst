"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First convert existing values to ensure they match the enum
    await queryInterface.sequelize.query(`
      UPDATE "CityInvite"
      SET status = 'pending'
      WHERE status IS NULL OR status NOT IN ('pending', 'accepted', 'canceled', 'expired');
    `);

    // Then modify the column to use the enum type (without default value)
    await queryInterface.changeColumn("CityInvite", "status", {
      type: Sequelize.ENUM("pending", "accepted", "canceled", "expired"),
      allowNull: false,
    });

    // Finally set the default value
    await queryInterface.sequelize.query(`
      ALTER TABLE "CityInvite" 
      ALTER COLUMN status SET DEFAULT 'pending';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove the default value first
    await queryInterface.sequelize.query(`
      ALTER TABLE "CityInvite" 
      ALTER COLUMN status DROP DEFAULT;
    `);

    // Change the column back to string
    await queryInterface.changeColumn("CityInvite", "status", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Set the default value for string type
    await queryInterface.sequelize.query(`
      ALTER TABLE "CityInvite" 
      ALTER COLUMN status SET DEFAULT 'pending';
    `);

    // Drop the enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_CityInvite_status";
    `);
  },
};
