"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First convert existing values to ensure they match the enum
    await queryInterface.sequelize.query(`
      UPDATE "UserFile"
      SET file_type = 'csv'
      WHERE file_type IS NULL OR file_type NOT IN ('csv', 'json', 'xlsx');
    `);

    // Then modify the column to use the enum type
    await queryInterface.changeColumn("UserFile", "file_type", {
      type: Sequelize.ENUM("csv", "json", "xlsx"),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the default value first
    await queryInterface.sequelize.query(`
      ALTER TABLE "UserFile" 
      ALTER COLUMN file_type DROP DEFAULT;
    `);

    // Change the column back to string
    await queryInterface.changeColumn("UserFile", "file_type", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Set the default value for string type
    await queryInterface.sequelize.query(`
      ALTER TABLE "UserFile" 
      ALTER COLUMN file_type SET DEFAULT 'csv';
    `);

    // Drop the enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_UserFile_file_type";
    `);
  },
};
