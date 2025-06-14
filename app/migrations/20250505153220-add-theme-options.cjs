"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    await queryInterface.createTable("Theme", {
      theme_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      theme_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
    });

    await queryInterface.addConstraint("Theme", {
      fields: ["theme_key"],
      type: "unique",
      name: "unique_theme_key",
    });

    await queryInterface.bulkInsert("Theme", [
      {
        theme_id: "d1b2e3f4-5678-90ab-cdef-1234567890ab",
        theme_key: "blue_theme",
        created: new Date(),
        last_updated: new Date(),
      },
      {
        theme_id: "d1b2e3f4-5678-90ab-cdef-1234567890ac",
        theme_key: "light_brown_theme",
        created: new Date(),
        last_updated: new Date(),
      },
      {
        theme_id: "d1b2e3f4-5678-90ab-cdef-1234567890ad",
        theme_key: "dark_orange_theme",
        created: new Date(),
        last_updated: new Date(),
      },
      {
        theme_id: "d1b2e3f4-5678-90ab-cdef-1234567890ae",
        theme_key: "green_theme",
        created: new Date(),
        last_updated: new Date(),
      },
      {
        theme_id: "d1b2e3f4-5678-90ab-cdef-1234567890af",
        theme_key: "light_blue_theme",
        created: new Date(),
        last_updated: new Date(),
      },
      {
        theme_id: "d1b2e3f4-5678-90ab-cdef-1234567890b1",
        theme_key: "violet_theme",
        created: new Date(),
        last_updated: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.bulkDelete("Theme", null, {});
    await queryInterface.removeConstraint("Theme", "unique_theme_key");
    await queryInterface.dropTable("Theme");
  },
};
