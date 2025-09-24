"use strict";

const { parseJsonFile, bulkUpsert } = require("./util/util.cjs");
const CCRA_PROJECT_ID = "3d1a4b2c-8e7f-4d5a-9c6b-1f2e3d4c5b6a";

/**
  INSERT INTO "Module" () VALUES ('9295ad69-72c6-4b1c-b29d-b71f7b8ba8e8', 'assess-and-analyze', 'GHGI', 'CC', '/GHGI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "Module" (id, step, name, type, url, created, last_updated) VALUES ('072a53d6-cd58-4622-b4e4-4f482baa23b3', 'plan', 'HIAP', 'CC', '/HIAP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const modules = await parseJsonFile("modules", "modules");
    await queryInterface.sequelize.transaction(async (transaction) => {
      const serializedModules = modules.map((module) => ({
        ...module,
        name: JSON.stringify(module.name),
        description: JSON.stringify(module.description),
        tagline: JSON.stringify(module.tagline),
        created: new Date(),
        last_updated: new Date(),
      }));

      await bulkUpsert(
        queryInterface,
        "Module",
        serializedModules,
        "id",
        transaction,
      );

      // Get all project IDs and create ProjectModules entries for CCRA
      const projects = await queryInterface.sequelize.query(
        'SELECT project_id FROM "Project"',
        { type: queryInterface.sequelize.QueryTypes.SELECT },
      );

      const projectModulesData = projects.map((project) => ({
        project_id: project.project_id,
        module_id: CCRA_PROJECT_ID,
        created: new Date(),
        last_updated: new Date(),
      }));

      if (projectModulesData.length > 0) {
        await queryInterface.bulkInsert("ProjectModules", projectModulesData);
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("ProjectModules", {
        module_id: CCRA_PROJECT_ID,
      });
      await queryInterface.bulkDelete("Module", null, { transaction });
    });
  },
};
