"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // CC-568: deleting a city fails with a FK constraint violation whenever
    // any user has that city set as their default_city_id, because this
    // constraint was created (20250724120000-add-cityid-to-user.cjs) without
    // an ON DELETE clause. The Sequelize model already declares
    // `onDelete: "SET NULL"` on User.defaultCityId, but that annotation only
    // takes effect via sequelize.sync() — it was never applied to the actual
    // DB constraint, which defaulted to NO ACTION.
    await queryInterface.sequelize.query(`
      ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_default_city_id_fkey";
      ALTER TABLE "User"
      ADD CONSTRAINT "User_default_city_id_fkey"
      FOREIGN KEY (default_city_id) REFERENCES "City" (city_id)
      ON DELETE SET NULL ON UPDATE CASCADE;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_default_city_id_fkey";
      ALTER TABLE "User"
      ADD CONSTRAINT "User_default_city_id_fkey"
      FOREIGN KEY (default_city_id) REFERENCES "City" (city_id);
    `);
  },
};
