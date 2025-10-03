"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface) {
    // Get all project IDs and create ProjectModules entries for CCRA
    const projects = await queryInterface.sequelize.query(
      'SELECT project_id FROM "Project"',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const projectModulesData = projects.map(project => ({
      project_id: project.project_id,
      module_id: '3d1a4b2c-8e7f-4d5a-9c6b-1f2e3d4c5b6a',
      created: new Date(),
      last_updated: new Date()
    }));

    if (projectModulesData.length > 0) {
      await queryInterface.bulkInsert("ProjectModules", projectModulesData);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("ProjectModules", {
      module_id: '3d1a4b2c-8e7f-4d5a-9c6b-1f2e3d4c5b6a'
    });
  },
};