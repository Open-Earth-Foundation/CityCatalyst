"use strict";

const sql_up = `create table if not exists public."AssistantThread"
(
    assistant_thread_id text primary key,
    assistant_id        text     
);
`;

const sql_down = `drop table if exists public."AssistantThread";`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
