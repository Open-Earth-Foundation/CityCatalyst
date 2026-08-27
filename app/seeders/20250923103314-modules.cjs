"use strict";

const { parseJsonFile, bulkUpsert } = require("./util/util.cjs");
const CCRA_PROJECT_ID = "3d1a4b2c-8e7f-4d5a-9c6b-1f2e3d4c5b6a";
const CONCEPT_NOTE_BUILDER_MODULE_ID = "7a2d4acc-230f-4810-ace6-a3c339f1f60e";
const PROJECT_WIDE_MODULE_IDS = [
  CCRA_PROJECT_ID,
  CONCEPT_NOTE_BUILDER_MODULE_ID,
];

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
      }));

      await bulkUpsert(
        queryInterface,
        "Module",
        serializedModules,
        "id",
        transaction,
        false,
        true, // insert timestamps on create
      );

      // Register OEF modules that are available to every project. Feature-gated
      // modules remain hidden in the application until their flags are enabled.
      const projects = await queryInterface.sequelize.query(
        'SELECT project_id FROM "Project"',
        { type: queryInterface.sequelize.QueryTypes.SELECT },
      );

      const projectModulesData = projects.flatMap((project) =>
        PROJECT_WIDE_MODULE_IDS.map((moduleId) => ({
          project_id: project.project_id,
          module_id: moduleId,
        })),
      );

      if (projectModulesData.length > 0) {
        await bulkUpsert(
          queryInterface,
          "ProjectModules",
          projectModulesData,
          ["project_id", "module_id"],
          transaction,
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("ProjectModules", {
        module_id: PROJECT_WIDE_MODULE_IDS,
      });
      await queryInterface.bulkDelete("Module", null, { transaction });
    });
  },
};
