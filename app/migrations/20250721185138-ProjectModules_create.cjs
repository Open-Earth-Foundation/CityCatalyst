"use strict";

const sql_up = `
    CREATE TABLE "ProjectModules" (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id UUID NOT NULL REFERENCES "Project"(project_id),
        module_id UUID NOT NULL REFERENCES "Module"(id),
        expires_on DATE
    );
    CREATE INDEX idx_projectmodules_project_id ON "ProjectModules" (project_id);
    CREATE INDEX idx_projectmodules_module_id ON "ProjectModules" (module_id);
`;

const sql_down = `
    DROP INDEX IF EXISTS idx_projectmodules_project_id;
    DROP INDEX IF EXISTS idx_projectmodules_module_id;
    DROP TABLE IF EXISTS "ProjectModules";
`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
}; 