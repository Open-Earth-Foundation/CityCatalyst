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
    await queryInterface.addColumn("Organization", "logo_url", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("Organization", "theme_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addConstraint("Organization", {
      fields: ["theme_id"],
      type: "foreign key",
      name: "FK_organization_theme_id",
      references: {
        table: "Theme",
        field: "theme_id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeConstraint(
      "Organization",
      "FK_organization_theme_id",
    );
    await queryInterface.removeColumn("Organization", "theme_id");
    await queryInterface.removeColumn("Organization", "logo_url");
  },
};
