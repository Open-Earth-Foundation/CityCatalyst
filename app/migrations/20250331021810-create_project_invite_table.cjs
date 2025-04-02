'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable("ProjectInvite", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
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
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "User",
          key: "user_id",
        },
      },
      status: {
        type: Sequelize.ENUM("pending", "accepted", "canceled", "expired"),
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

    await queryInterface.addConstraint("ProjectInvite", {
      fields: ["project_id"],
      type: "foreign key",
      name: "FK_project_invite_project_id",
      references: {
        table: "Project",
        field: "project_id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    await queryInterface.addConstraint("ProjectInvite", {
      fields: ["user_id"],
      type: "foreign key",
      name: "FK_project_invite_user_id",
      references: {
        table: "User",
        field: "user_id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });


  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeConstraint("ProjectInvite", "FK_project_invite_project_id");
    await queryInterface.removeConstraint("ProjectInvite", "FK_project_invite_user_id");
    await queryInterface.dropTable("ProjectInvite");
  }
};
