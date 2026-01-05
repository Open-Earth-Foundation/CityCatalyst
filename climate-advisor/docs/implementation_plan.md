# Conversation History Pruning - Implementation Plan

## Objectives
- Persist and replay only user-visible dialogue (user asks, assistant answers); drop tool call chatter and bulky payloads from saved history except where explicitly preserved.
- Keep at least the two most recent turns verbatim **with full tool call/request/response details**; **do not generate or store history summaries in this iteration**.
- Make pruning behavior configurable (limits, tool persistence) and resilient when the database is unavailable.

## Current State (as of 2026-01-02)
- Messages are stored via `service/app/routes/messages.py` + `MessageService`; user and assistant messages include `text` plus optional `tools_used` blobs.
- Conversation history for the LLM is loaded in `utils/streaming_handler.py::_load_conversation_history` with `llm_config.yaml` defaults (`include_history=true`, `history_limit=5`); it currently returns raw message texts without pruning.
- Tool invocations are captured in-memory during streaming and attached to the assistant message (`tools_used`) and to the SSE `done` event payload.
- No summarization exists; every request reloads the last N rows and sends them verbatim.

## Proposed Approach (no summaries)
Implement configurable pruning that:
1) Loads recent messages; for older turns (outside the preserve window) strips tool details before passing to the LLM.
2) Preserves the latest N turns intact (default 2 turns = 4 messages if alternating roles), **including full tool calls and outputs**.
3) Excludes older turns beyond the preserve window instead of summarizing them (only user/assistant text retained, no tools).
4) Optionally redacts or skips persisting `tools_used` for older turns while keeping full metadata for preserved turns.

## Work Breakdown
- **Config**
  - Extend `llm_config.yaml` with a `conversation.retention` block (e.g., `preserve_turns`, `max_loaded_messages`, `persist_tool_invocations`, `prune_tools_for_llm`, `preserve_tools_for_latest_turns=true`).
  - Document that summarization is intentionally disabled for this release.

- **History Manager Utility**
  - Add `service/app/utils/history_manager.py` to:
    - `load_messages(thread_id, limit)` using `MessageService`, ordered oldest -> newest.
    - `build_context(messages, preserve_turns)` that:
      - Splits messages into `preserved` (latest N turns) and `discarded` (older).
      - Returns LLM-ready messages where preserved turns include full tool metadata, while discarded turns have `tools_used` removed (user/assistant text only).
  - Add guards for DB-optional mode to fall back to empty history when sessions are unavailable.

- **Pruning & Persistence Changes**
  - In `utils/streaming_handler.py`:
    - Replace `_load_conversation_history` usage with the new history manager to inject preserved turns (with tools) plus older turns with tools stripped.
    - Ensure older turns beyond the preserve window are not sent back with tool payloads.
  - In `utils/tool_handler.py` + `MessageService.create_assistant_message`:
    - Gate persistence of `tools_used` behind config; if disabled, store `None` or a trimmed `{name, status}` list for older turns, while preserved turns retain full metadata.
    - Ensure SSE `done` event only returns sanitized tool metadata (or is gated by the same flag).

- **Schema / Data**
  - No new columns; summarization state is out of scope.


- **Testing**
  - Unit tests for history manager:
    - Older turns beyond the preserve window are included as user/assistant text only (tools stripped).
    - Preserved turns retain full tool metadata.
  - Integration/e2e:
    - SSE still streams correctly and final history includes preserved turns with tools intact.
    - Config flag toggles tool persistence (older DB rows have `tools_used` null/trimmed).
    - Token/count regression: context length shrinks after multiple turns by discarding/stripping older turns.

- **Observability & Ops**
  - Add logging around pruning decisions (messages loaded, preserved count).
  - Document config defaults and rollout steps in `docs/README` or `docs/architecture.md` appendix.
  - Provide a feature flag rollout plan: start in shadow mode (pruning enabled, tool persistence toggled), then enable for production.


## Sequencing
1) Add config toggles (retention, tool persistence) and docs.
2) Implement history manager to load/prune (no summaries) with tests.
3) Wire into streaming handler and persistence gating for `tools_used`.
4) Add integration tests and optional data cleanup script.
5) Roll out behind config flags; monitor token usage and DB payload sizes.
