"use strict";

const sql_up = `
BEGIN;
create type role_enum as enum('user', 'assistant');

create table if not exists public."AssistantMessage"
(
    assistant_message_id  text not null primary key,
    thread_id             text not null,
    role                  role_enum not null,
    timestamp             timestamp not null,    
    content               text,
    created               timestamp,
    last_updated          timestamp,
    CONSTRAINT fk_thread  
      FOREIGN KEY(thread_id)   
      REFERENCES public."AssistantThread"(assistant_thread_id)  
      ON DELETE CASCADE
);

CREATE INDEX idx_assistant_message_thread_id ON public."AssistantMessage" (thread_id);
COMMIT;  
`;
const sql_down = `drop table if exists public."AssistantMessages";
DROP TYPE IF EXISTS role_enum;`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
