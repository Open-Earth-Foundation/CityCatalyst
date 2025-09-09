"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Theme", "primary_color", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "#2351DC",
      comment: "contains the primary color of the theme",
    });

    // 2. Set real values for each theme
    await queryInterface.bulkUpdate(
      "Theme",
      { primary_color: "#2351DC" },
      { theme_key: "blue_theme" },
    );

    await queryInterface.bulkUpdate(
      "Theme",
      { primary_color: "#B0901C" },
      { theme_key: "light_brown_theme" },
    );

    await queryInterface.bulkUpdate(
      "Theme",
      { primary_color: "#B0661C" },
      { theme_key: "dark_orange_theme" },
    );

    await queryInterface.bulkUpdate(
      "Theme",
      { primary_color: "#7FB01C" },
      { theme_key: "green_theme" },
    );

    await queryInterface.bulkUpdate(
      "Theme",
      { primary_color: "#1CAEB0" },
      { theme_key: "light_blue_theme" },
    );

    await queryInterface.bulkUpdate(
      "Theme",
      { primary_color: "#7F1CB0" },
      { theme_key: "violet_theme" },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Theme", "primary_color");
  },
};
