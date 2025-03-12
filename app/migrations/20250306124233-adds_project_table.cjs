"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Project", {
      project_id: {
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
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      city_count_limit: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
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

    await queryInterface.addConstraint("Project", {
      fields: ["organization_id"],
      type: "foreign key",
      name: "FK_project_organization_id",
      references: {
        table: "Organization",
        field: "organization_id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "Project",
      "FK_project_organization_id",
    );
    await queryInterface.dropTable("Project");
  },
};
