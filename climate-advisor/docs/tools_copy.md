# Climate Advisor Inventory Tooling – Implementation Tickets

## CA-INV-01 · Extend CityCatalyst HTTP Client

- **Goal:** wrap CC inventory endpoints with typed helpers that honour JWT refresh.
- **Scope:** update `service/app/services/citycatalyst_client.py` with `get_inventory`, `get_inventory_datasources`, `get_user_inventories`; ensure URLs follow `/api/v1/*`; reuse existing refresh logic; log with `token_manager.redact_token`.
- **Deliverables:** new client methods, structured error handling, unit coverage via `respx` asserting auth headers and retry semantics.
- **Dependencies:** settings contain `CC_BASE_URL`; token manager utilities already in place.

## CA-INV-02 · Productionise CC Inventory Tool

- **Goal:** replace mock implementation in `service/app/tools/cc_inventory_tool.py` with real calls.
- **Scope:** depend on the client helpers; expose async methods (`fetch_inventory`, `fetch_inventory_datasources`, `fetch_user_inventories`) returning `CCInventoryToolResult`; emit consistent error codes (`missing_token`, `cc_unavailable`, `not_found`); strip debug prints.
- **Deliverables:** production-ready tool class, token validation hooks, unit tests with mocked client covering success, 404, 500, token missing/refresh.
- **Dependencies:** CA-INV-01.

## CA-INV-03 · Tool Wrappers for Agents SDK

- **Goal:** expose three function tools consumable by the OpenAI Agents runtime.
- **Scope:** add a factory (e.g. `build_cc_inventory_tools`) that receives token/user/thread context and returns `@function_tool` wrappers; validate arguments; call `CCInventoryTool`; return JSON strings mirroring CC payloads (`InventoryResponse`, `GetDataSourcesResult`, `InventoryWithCity[]`); surface structured error objects when calls fail or token is absent.
- **Deliverables:** new module in `service/app/tools`, exported via `__all__`, unit tests for serialization & error paths.
- **Dependencies:** CA-INV-02.

## CA-INV-04 · Wire Tools into AgentService

- **Goal:** make the inventory tools available to assistants created per request.
- **Scope:** update `service/app/services/agent_service.py` to build the tool list dynamically (vector search + inventory tools when token present); document behaviour when token missing (either skip or keep with warning); ensure any tool-level async resources are cleaned up in `close()`.
- **Deliverables:** modified agent factory, logging for tool availability, regression tests asserting tool set composition.
- **Dependencies:** CA-INV-03.

## CA-INV-05 · Stream Pipeline Enhancements

- **Goal:** ensure streaming route handles SSE error notifications with token refresh logic extracted to a helper function invoked when tools are called.
- **Scope:** extract token refresh handling into a helper function in `service/app/tools/` that is invoked during tool execution; in `service/app/routes/messages.py`, when a tool signals `missing_token` or `expired_token`, emit the documented `error` SSE so CC can mint a new JWT; persist tool invocation metadata with meaningful summaries.
- **Deliverables:** helper function for token refresh, updated streaming handler, integration tests in `service/tests/test_service_stream.py` covering success vs. token-missing flows, verified SSE payloads.
- **Dependencies:** CA-INV-04.

## CA-INV-06 · Persistence & Observability

- **Goal:** capture assistant messages and tool usage for auditing.
- **Scope:** ensure `persist_assistant_message` (and related utilities) store tool outputs/arguments; update analytics hooks if present; verify DB schema supports the data (add migration only if required).
- **Deliverables:** code changes plus regression tests validating stored message records include tool metadata.
- **Dependencies:** CA-INV-05.

## CA-INV-07 · Documentation & Developer Enablement

- **Goal:** document the new tools, configuration, and troubleshooting guidance.
- **Scope:** update `docs/CC-CA-communication-implementation.md`, `docs/QUICK_REFERENCE.md`, and service `README.md` with tool names, endpoints, required env vars, token refresh contract; add example snippets showing how errors map to SSE events.
- **Deliverables:** refreshed docs, emphasising JWT handling and expected CC responses.
- **Dependencies:** CA-INV-05 (content accuracy).

## CA-INV-08 · Test & CI Coverage

- **Goal:** guarantee new functionality is covered in automated runs.
- **Scope:** add/extend pytest suites for client, tools, streaming flow; configure fixtures for CC mocks; update CI scripts if new env vars/tests are required; mark completion status once suites pass locally.
- **Deliverables:** new tests merged into `service/tests`, CI config updates, documentation of test commands in `QUICK_REFERENCE.md`.
- **Dependencies:** CA-INV-01 through CA-INV-07.
