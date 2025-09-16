# Persistence and User Identity

The Climate Advisor service stores chat history in its own PostgreSQL schema. Every thread and message row carries the `user_id` that originated the conversation so we can trace history, enforce access control, and perform audits.

## Thread lifecycle

- `POST /v1/threads` requires `user_id` in the payload. The service persists that value on the `threads.user_id` column and uses it as the ownership key.
- Any subsequent lookups for a thread go through `ThreadService.get_thread_for_user`, which raises a permission error if the caller presents a different `user_id`.

## Message lifecycle

- `POST /v1/messages` requires `user_id`. The route validates ownership before inserting the user message and again before saving the assistant response.
- The `messages` table records both user and assistant roles along with the `user_id`, timestamps, and optional tool metadata.

## Caller responsibilities

CityCatalyst must:

1. Pass the authenticated user identifier with every request (`user_id` field).
2. Persist the mapping between CC users and the identifiers sent to Climate Advisor.
3. Query the Climate Advisor tables by `user_id` when exporting or auditing history:
   ```sql
   select thread_id, created_at, updated_at
   from threads
   where user_id = 'user-123';

   select message_id, role, content, created_at
   from messages
   where thread_id = 'thread-xyz'
     and user_id = 'user-123'
   order by created_at;
   ```

By centralising the ownership checks in the service layer we guarantee that cross-user access is blocked even if a downstream caller misbehaves.
