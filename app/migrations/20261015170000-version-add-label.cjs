"use strict";

/**
 * Marks versions written by a bulk operation (e.g. replacing an inventory from
 * a file) so the history panel can show the snapshot taken before the replace
 * as its own restorable entry. Null for ordinary edits.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Version", "label", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Version", "label");
  },
};
