# CC-554: ordinary Climate Advisor MLflow trace map

Snapshot: 2026-09-08 09:59:22 UTC. Search window begins 2026-09-01 09:59:20 UTC (seven days).

Tracking server: https://mlflow-dev.openearth.dev. Experiment: `Clima` (ID `4`). Authenticated read-only using `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, and `MLFLOW_TRACKING_PASSWORD` from the original checkout's ignored `climate-advisor/.env`. Exports contain metadata, not credentials or conversation payloads. Environment names below are recorded run tags, not independently verified deployment identities.

Branch: `codex/CC-554-ca-mlflow-trace-map`, based on freshly fetched `origin/develop` at `cae09998b`. The original checkout and unrelated edits were preserved. Linear requires reauthentication, so the ticket description could not be read; scope follows the user request and ticket URL title.

## Scope and classification

The paginated search returned 66 traces and 128 runs. Exactly **48 traces link to 38 ordinary CA runs** through `trace_metadata["mlflow.sourceRun"]`. Those runs have `workflow=climate_advisor_conversation`, `ca_agentic_flow=False`, `trace_category=normal_conversation`, and `context_mode=general`. All 38 runs have at least one trace. The other 18 traces and 90 runs are tagged CNB and are excluded. No Stationary Energy context-chat runs appeared in this sample.

Filtering only trace workflow tags misses 25 CA traces: prod/test traces have generic names and no workflow tags. Join through the source run; the experiment name alone is insufficient. Ordinary CA can call inventory tools without being a scoped agentic workflow.

## Environment map

| Environment tag | CA runs | CA traces | Trace shape | Model in model spans |
| --- | ---: | ---: | --- | --- |
| dev | 18 | 18 | CA CHAIN root + model children | openai/gpt-5.6-luna |
| local-david | 5 | 5 | CA CHAIN root + model/tool children | openai/gpt-5.6-luna |
| test | 6 | 9 | Separate AsyncCompletions traces | openai/gpt-5.4-mini |
| prod | 9 | 16 | Separate AsyncCompletions traces | openai/gpt-5.4-mini |

There are 23 named CA root traces and 25 standalone model traces. All 48 trace states are `OK`; all 38 run states are `FINISHED`. These states do not guarantee application completion (see cancellation findings). The span inventory contains 67 model calls: 42 using `openai/gpt-5.6-luna` and 25 using `openai/gpt-5.4-mini`.

Five local-david traces expose 14 tool spans: `native_input_discover` (4), `native_input_read` (3), `inventory_list_accessible` (3), `inventory_status_overview` (3), and `get_all_datasources` (1). Tool invocation counts in run metrics and visible TOOL spans are distinct measurements.

## Latest trace per environment

| Environment | UTC start | Trace ID | Duration |
| --- | --- | --- | ---: |
| dev | 2026-09-08 09:53:58.763 | tr-4e29c721feec07012e87a4af678a3ae6 | 8.452 s |
| local-david | 2026-09-07 14:12:35.658 | tr-65e579a68e3222c9e024416f5d50f7a7 | 11.418 s |
| test | 2026-09-04 12:57:12.506 | tr-30440e67707c23a1f89d13961176848d | 0.616 s |
| prod | 2026-09-03 19:12:09.695 | tr-26d5055ab8c3565b1a82020232e7dc1d | 2.067 s |

The trace CSV includes source run links for every trace. Generic prod/test durations measure individual model calls and should not be compared directly to full dev/local chain durations.

## Runtime and artifact map

Current source path, relative to `climate-advisor/`:

1. `service/app/routes/messages.py:39`: `POST /messages` creates the streaming handler.
2. `service/app/utils/chat_workflow_context.py`: selects ordinary CA workflow labels and `climate_advisor_message_request` run name when no scoped workflow run ID exists.
3. `service/app/utils/streaming_handler.py:117`: starts the MLflow run and records the incoming payload.
4. `streaming_handler.py:687`: creates the `Climate Advisor Conversation` CHAIN root around Agents SDK streaming.
5. `service/app/utils/mlflow_logging.py:358`: attaches source-run correlation and trace context.
6. `streaming_handler.py:1269`: logs application metrics, collected response, tool invocations, and stream summary after streaming/persistence.

This describes the branch baseline, not proof of which revision each deployed environment runs.

Every CA run contains five standard artifacts. Two cancelled prod runs contain an additional cancellation artifact.

| Artifact | Files | Total bytes | Purpose |
| --- | ---: | ---: | --- |
| request/message_payload.json | 38 | 9,354 | Incoming request payload |
| chat/conversation_history.json | 38 | 26,276 | History supplied to the agent |
| chat/assistant_response.txt | 38 | 22,117 | Collected assistant output |
| chat/tool_invocations.json | 38 | 104,456 | Recorded tool calls/results |
| response/stream_summary.json | 38 | 7,964 | Application outcome, model, persistence, counts |
| errors/stream_cancelled.json | 2 | 294 | Cancellation evidence |

Total: **192 files / 170,461 bytes**. MLflow separately reports **4,548,861 bytes** for the 48 trace payloads. This is a sample inventory, not a backend storage or billing audit. Model span inputs contain messages and tool schemas; outputs contain choices and usage. Artifact content and trace content overlap conceptually, but byte-for-byte duplication was not measured.

## Cleanup findings and next steps

1. **Align trace classification.** Dev/local have request roots and workflow tags; prod/test expose individual untagged model traces. Preserve source-run joins for historical data. Current develop already creates the root, so compare deployment revisions before adding instrumentation. Trace git commit metadata is empty for dev/test/prod; this sample cannot establish their deployed revisions.
2. **Expose application outcome.** Prod runs `e5c034e9b89b420fb0807b750852eae3` and `93b6a0fbc14040618456c56cec146aae` have `ok=0`, `history_saved=0`, and `errors/stream_cancelled.json`, yet their runs are `FINISHED` and their model traces are `OK`. Retain these as diagnostic examples and check cancellation/outcome propagation. A successful model call can precede a cancelled request; it does not prove that the reply was saved.
3. **Evaluate payload retention by purpose.** Conversation history, responses, tool results, and model trace payloads may overlap. Define what remains searchable in traces and what remains as run artifacts before removing either. This sample does not establish a safe retention age or prove any file is unused.
4. **Filter environments explicitly.** Prod, test, dev, and local activity share this tracking server and experiment. Use the linked run's environment tag to scope counts.

## Evidence and verification

- [Trace CSV](CC-554-ca-traces-2026-09-08.csv): all 48 traces, exact IDs, source runs, environments, models, timing, token metadata, and application outcomes.
- [Run CSV](CC-554-ca-runs-2026-09-08.csv): all 38 runs, linked traces, artifact paths/counts/sizes, and outcome metrics.
- [Before/after verification](CC-554-ca-before-after-example.md) and [revamped trace JSON](CC-554-ca-revamped-trace-example.json): deterministic evidence for the implemented storage shape.
- Authenticated run/trace searches were paginated to exhaustion. All 48 selected trace payloads were read and all 38 selected run artifact trees were listed. Classification uses explicit run tags rather than prompt guesses.
- The mapping phase was read-only. The branch now also contains the follow-up
  instrumentation cleanup and two labelled synthetic MLflow verification runs;
  historical traces, retention settings, deployments, and ticket content were
  not changed.
