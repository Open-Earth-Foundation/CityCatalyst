'use strict';

const sql_up = `
  INSERT INTO "Module" (id, step, name, type, url, created, last_updated) VALUES ('9295ad69-72c6-4b1c-b29d-b71f7b8ba8e8', 'assess-&-analyze', 'GHGI', 'CC', '/GHGI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "Module" (id, step, name, type, url, created, last_updated) VALUES ('072a53d6-cd58-4622-b4e4-4f482baa23b3', 'plan', 'HIAP', 'CC', '/HIAP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`;

const sql_down = `
  DELETE FROM "Module" WHERE id IN ('9295ad69-72c6-4b1c-b29d-b71f7b8ba8e8', '072a53d6-cd58-4622-b4e4-4f482baa23b3');
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
