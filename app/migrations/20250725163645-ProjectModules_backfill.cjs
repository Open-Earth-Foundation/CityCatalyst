"use strict";

const sql_up = `
  INSERT INTO "Module" (id, type, step, name, description, author, url) VALUES ('9ee0e1ea-94ea-4329-b156-28d10ecd0ff8', 'OEF', 'plan', '{"de": "CC-Maßnahmen", "en": "CC Actions", "es": "Acciones CC", "fr": "Actions CC", "pt": "Ações CC"}', '{"en": "HIAP"}', 'Open Earth Foundation', '/HIAP');
  INSERT INTO "Module" (id, type, step, name, description, author, url) VALUES ('077690c6-6fa3-44e1-84b7-6d758a6a4d88', 'OEF', 'assess-and-analyze', '{"de": "CC-Inventare", "en": "CC Inventories", "es": "Inventarios CC", "fr": "Inventaires CC", "pt": "Inventários CC"}', '{"en": "GHGI"}', 'Openearth Foundation', '/GHGI');

  INSERT INTO "ProjectModules" (project_id, module_id, created, last_updated)
  SELECT project_id, '9ee0e1ea-94ea-4329-b156-28d10ecd0ff8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Project"
  ON CONFLICT DO NOTHING;
`;

const sql_down = `
  
`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
