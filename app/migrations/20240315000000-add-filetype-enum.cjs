"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create the enum type
    await queryInterface.sequelize.query(`
            DO $$ BEGIN
                CREATE TYPE "enum_UserFile_file_type" AS ENUM ('csv', 'json', 'xlsx');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

    // Modifies the column to use the enum type
    await queryInterface.changeColumn("UserFile", "file_type", {
      type: Sequelize.ENUM("csv", "json", "xlsx"),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Change the column back to string
    await queryInterface.changeColumn("UserFile", "file_type", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Drop the enum type
    await queryInterface.sequelize.query(`
            DROP TYPE IF EXISTS "enum_UserFile_file_type";
        `);
  },
};
