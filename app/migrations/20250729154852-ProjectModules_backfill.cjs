"use strict";

const sql_up = `
  DELETE FROM "ProjectModules" WHERE true;
  alter table "ProjectModules"
    add constraint ProjectModules_pk
        unique (module_id, project_id);

  INSERT INTO "ProjectModules" (project_id, module_id, created, last_updated)
  SELECT project_id, '077690c6-6fa3-44e1-84b7-6d758a6a4d88', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Project";

  update "Module" set stage = 'assess-&-analyze' where stage = 'assess-and-analyze'
`;

const sql_down = `
alter table "ProjectModules"
    drop constraint projectmodules_pk;

  DELETE FROM "ProjectModules" WHERE module_id = '077690c6-6fa3-44e1-84b7-6d758a6a4d88';
`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
