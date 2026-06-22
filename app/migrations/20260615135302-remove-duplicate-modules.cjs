"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // allow deleting modules and projects without constraint errors
    await queryInterface.removeConstraint(
      "ProjectModules",
      "ProjectModules_module_id_fkey",
    );
    await queryInterface.addConstraint("ProjectModules", {
      fields: ["module_id"],
      type: "foreign key",
      name: "ProjectModules_module_id_fkey",
      references: {
        table: "Module",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.removeConstraint(
      "ProjectModules",
      "ProjectModules_project_id_fkey",
    );
    await queryInterface.addConstraint("ProjectModules", {
      fields: ["project_id"],
      type: "foreign key",
      name: "ProjectModules_project_id_fkey",
      references: {
        table: "Project",
        field: "project_id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // remove duplicate modules GHGI and HIAP (without descriptions)
    await queryInterface.bulkDelete("Module", {
      id: "9295ad69-72c6-4b1c-b29d-b71f7b8ba8e8",
    });
    await queryInterface.bulkDelete("Module", {
      id: "072a53d6-cd58-4622-b4e4-4f482baa23b3",
    });
  },

  async down(queryInterface) {
    // revert changes to foreign keys
    await queryInterface.removeConstraint(
      "ProjectModules",
      "ProjectModules_module_id_fkey",
    );
    await queryInterface.addConstraint("ProjectModules", {
      fields: ["module_id"],
      type: "foreign key",
      name: "ProjectModules_module_id_fkey",
      references: {
        table: "Module",
        field: "id",
      },
    });
    await queryInterface.removeConstraint(
      "ProjectModules",
      "ProjectModules_project_id_fkey",
    );
    await queryInterface.addConstraint("ProjectModules", {
      fields: ["project_id"],
      type: "foreign key",
      name: "ProjectModules_project_id_fkey",
      references: {
        table: "Project",
        field: "project_id",
      },
    });
  },
};
