"use strict";

/**
 * Marks an account whose identifying fields have been replaced by retention.
 * The row stays so city and inventory foreign keys remain valid.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("User", "anonymized_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("User", ["anonymized_at"], {
      name: "User_anonymized_at_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("User", "User_anonymized_at_idx");
    await queryInterface.removeColumn("User", "anonymized_at");
  },
};
