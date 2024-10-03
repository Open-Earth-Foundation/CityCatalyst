"use strict";

const sql_up = `create type role_enum as enum('user', 'assistant');

create table if not exists public."AssistantMessages"
(
    assistant_message_id  text not null primary key,
    thread_id             text references "AssistantThread"(assistant_thread_id),
    role                  role_enum,
    created_at            timestamp,    
    content               text
);
`;
const sql_down = `drop table if exists public."AssistantMessages";`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
