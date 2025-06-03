"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First convert existing values to ensure they match the enum
    await queryInterface.sequelize.query(`
      UPDATE "User"
      SET role = 'user'
      WHERE role IS NULL OR role NOT IN ('admin', 'user');
    `);

    // Then modify the column to use the enum type (without default value)
    await queryInterface.changeColumn("User", "role", {
      type: Sequelize.ENUM("admin", "user"),
      allowNull: false,
    });

    // Finally set the default value
    await queryInterface.sequelize.query(`
      ALTER TABLE "User" 
      ALTER COLUMN role SET DEFAULT 'user';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove the default value first
    await queryInterface.sequelize.query(`
      ALTER TABLE "User" 
      ALTER COLUMN role DROP DEFAULT;
    `);

    // Change the column back to string
    await queryInterface.changeColumn("User", "role", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Set the default value for string type
    await queryInterface.sequelize.query(`
      ALTER TABLE "User" 
      ALTER COLUMN role SET DEFAULT 'user';
    `);

    // Drop the enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_User_role";
    `);
  },
};
