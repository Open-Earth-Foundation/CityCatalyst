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

    // table that stores organization and OrgAdmin User.
    await queryInterface.createTable("OrganizationAdmin", {
      organization_admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Organization",
          key: "organization_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "User",
          key: "user_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      role: {
        type: Sequelize.ENUM("ORGANISATION_ADMIN"),
        allowNull: false,
      },
      created: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      last_updated: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addConstraint("OrganizationAdmin", {
      fields: ["organization_id"],
      type: "foreign key",
      name: "FK_organization_admin_organization_id",
      references: {
        table: "Organization",
        field: "organization_id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    await queryInterface.addConstraint("OrganizationAdmin", {
      fields: ["user_id"],
      type: "foreign key",
      name: "FK_organization_admin_user_id",
      references: {
        table: "User",
        field: "user_id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
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
      "OrganizationAdmin",
      "FK_organization_admin_organization_id",
    );
    await queryInterface.removeConstraint(
      "OrganizationAdmin",
      "FK_organization_admin_user_id",
    );
    await queryInterface.dropTable("OrganizationAdmin");
  },
};
