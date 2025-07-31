"use strict";

const sql_up = `
drop table if exists "ProjectModules";
drop table if exists "Module";

CREATE TABLE "Module" (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        type TEXT NOT NULL,
        stage TEXT NOT NULL,
        name JSONB NOT NULL,
        description JSONB NOT NULL,
        tagline JSONB NOT NULL,
        author TEXT NOT NULL,
        url TEXT NOT NULL,
        logo TEXT NULL,
        created         timestamp DEFAULT CURRENT_TIMESTAMP,
        last_updated    timestamp DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_module_stage ON "Module" (stage);
    CREATE INDEX idx_module_name ON "Module" (name);

     CREATE TABLE "ProjectModules" (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id UUID NOT NULL REFERENCES "Project"(project_id),
        module_id UUID NOT NULL REFERENCES "Module"(id),
        expires_on DATE,
        created         timestamp,
        last_updated    timestamp
    );
    CREATE INDEX idx_projectmodules_project_id ON "ProjectModules" (project_id);
    CREATE INDEX idx_projectmodules_module_id ON "ProjectModules" (module_id);
`;

const sql_down = `
drop table if exists "ProjectModules";
drop table if exists "Module";
`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
