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
    await queryInterface.createTable("ProjectAdmin", {
      project_admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Project",
          key: "project_id",
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
      created: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      last_updated: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addConstraint("ProjectAdmin", {
      fields: ["project_id"],
      type: "foreign key",
      name: "FK_project_admin_project_id",
      references: {
        table: "Project",
        field: "project_id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    await queryInterface.addConstraint("ProjectAdmin", {
      fields: ["user_id"],
      type: "foreign key",
      name: "FK_project_admin_user_id",
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
      "ProjectAdmin",
      "FK_project_admin_project_id",
    );
    await queryInterface.removeConstraint(
      "ProjectAdmin",
      "FK_project_admin_user_id",
    );
    await queryInterface.dropTable("ProjectAdmin");
  },
};
