"use strict";

/**
 * Drop legacy OpenAI Assistants persistence tables.
 * Chat history now lives in climate-advisor; CityCatalyst no longer stores
 * AssistantThread / AssistantMessage rows.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Messages first (FK to AssistantThread), then the enum type.
    await queryInterface.sequelize.query(`
DROP TABLE IF EXISTS public."AssistantMessage";
DROP TABLE IF EXISTS public."AssistantThread";
DROP TYPE IF EXISTS role_enum;
`);
  },

  async down(queryInterface) {
    // Recreate the original schema from 20241003 create migrations.
    await queryInterface.sequelize.query(`
create table if not exists public."AssistantThread"
(
    assistant_thread_id text not null primary key,
    assistant_id        text not null,
    created             timestamp,
    last_updated        timestamp
);
`);

    await queryInterface.sequelize.query(`
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
`);
  },
};
