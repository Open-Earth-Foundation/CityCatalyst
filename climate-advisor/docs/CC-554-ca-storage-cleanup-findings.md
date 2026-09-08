# CC-554: what ordinary CA actually stores, and what to clean up

Implementation follow-up: this branch now compacts newly emitted ordinary CA
streaming events, stores system prompt snapshots on the request root, and records
tool execution spans. See the [README](../README.md) for the implemented behavior.
The measurements and read-only audit statements below describe the earlier live
sample; historical MLflow data has not been rewritten.

This follow-up reads the contents of all **192 artifacts and 48 traces** from the [seven-day CA map](CC-554-ca-mlflow-trace-map.md), covering 38 ordinary CA requests on September 1–8, 2026. CNB and scoped agentic workflows remain excluded. The original sample is held fixed so the comparisons use the same requests.

The strongest cleanup opportunity is **streaming-event storage**, followed by duplicate tool schemas and redundant run artifacts. All run artifacts together account for only 3.7% of the downloaded payload bytes, and deleting them would lose useful cancellation evidence in this sample.

## What is physically returned by the artifact API

| Storage layer | Objects inspected | Downloaded bytes |
| --- | ---: | ---: |
| Run artifacts | 192 files | 170,461 |
| Trace payloads (`traces.json`) | 48 files | 4,451,237 |
| Combined | 240 files | 4,621,698 |

MLflow's trace metadata reports 4,548,861 bytes, which differs from the actual trace JSON response lengths above. Neither measurement establishes bucket allocation, backend database size, compression, or billing. Nested-field comparisons below use normalized JSON; they are not additive storage savings.

## What is inside each run artifact

| Artifact | Actual fields/content | Duplication proven in this sample | Cleanup decision |
| --- | --- | --- | --- |
| `request/message_payload.json` | `user_id`, `thread_id`, `inventory_id`, full user `content`, `context`, `options` | User text appears exactly in model inputs for 38/38 runs | Keep request identifiers/context needed for diagnosis; omit the second full text copy once trace export is confirmed |
| `chat/conversation_history.json` | 54 role/content messages across 38 files | All role/content pairs appear in model inputs for 34/38 runs | Make this a debug/failure artifact; investigate the four transformed-history exceptions before historical deletion |
| `chat/assistant_response.txt` | Full collected assistant text | Exact match to a stored model output in 37/38 runs | Avoid a routine second copy, but retain a failure/cancellation fallback |
| `chat/tool_invocations.json` | 31 invocation records across 22 nonempty files; 16 empty files | Eight string results appear exactly in later model tool messages; one result exists twice inside the same artifact | Stop writing empty files; normalize the logging representation and keep one result representation |
| `response/stream_summary.json` | `ok`, `status`, `history_saved`, `thread_id`, `model`, `assistant_characters`, `tool_invocation_count` | `ok`, `history_saved`, and `assistant_characters` equal the run metrics in 38/38 runs | Prefer searchable metrics/tags for the summary, after checking remaining field parity |
| `errors/stream_cancelled.json` | Exception type, cancellation message, thread ID | Two runs; explains failed application completion | Keep the diagnostic information and expose it on the request root/run |

The two tool-record formats are materially different:

- Seventeen records use `id`, `name`, `arguments`, `status`, and a string `result`. Sixteen are `climate_vector_search`; one is `inventory_list_accessible`.
- Fourteen records use `call_id`, `tool_name`, `sequence`, `state`, `outcome`, `duration_ms`, `request_id`, `run_id`, `input`, and `output`. These correspond to the local inventory TOOL spans.
- The inventory-list record stores equivalent `result` and `result_json`. Parsing the former produced exactly the latter. Its redundant string alone is 15,184 bytes in normalized JSON. The total tool-result artifact footprint is 104,456 bytes, so this is a concrete local cleanup, not a hypothetical overlap.

Do not conclude that the fourteen structured records are unnamed: they use `tool_name`, whereas the older records use `name`.

## The largest contributor: raw streaming chunks

All 67 model spans contain streaming events: **4,146 chunk objects** in total. Each wraps provider metadata such as completion ID, model, creation time, choices/delta, provider and usage fields, plus an event name and timestamp. The final reconstructed completion is also stored in `mlflow.spanOutputs`.

In a local, in-memory serialization comparison, replacing every span's event list with an empty list reduces normalized trace JSON from **4,416,640 to 1,859,821 bytes**: **2,556,819 bytes, or 57.9%**. This was a calculation only; nothing was deleted remotely. It is a ceiling for that representation change, not a forecast of billable storage savings.

The chunk data is not consistently a complete replay:

- **18 spans retain exactly 128 events and begin after chunk zero.** For example, `tr-4e29c721feec07012e87a4af678a3ae6` / `AsyncCompletions_2` stores chunk indices 110–237. Its final response has 1,248 characters, while retained chunk text contains only 678.
- **861 chunks contain tool-call deltas. Thirty model spans have those deltas but no populated tool calls in the final stored model output.** Tool information can still exist in later model inputs, invocation artifacts, or dedicated TOOL spans. It is not safe to assume `spanOutputs` alone preserves it.

The installed MLflow 3.2 client explains this behavior: `openai/autolog.py` logs every chunk in `_add_span_event`, then `_reconstruct_completion_from_stream` reconstructs assistant content without aggregating tool-call deltas. The installed OpenTelemetry SDK defaults to 128 events per span. Those source facts are consistent with the live data; they do not independently establish every environment's deployed package version.

**Recommended target:** keep final model output, complete structured tool calls/results, usage, finish reason, request/model timing, and a compact streaming summary. Make raw token events an explicit debug option. Preserve first-token latency and interruption information as explicit measurements if needed; removing events without replacements loses that detail. First verify complete tool-call capture and cancellation handling, then reduce normal CA streaming events.

## Prompts, schemas, and other repeated trace fields

The model inputs contain full system prompts, user/history messages, tool-result messages, complete function definitions, and provider parameters.

| Repeated content | Observed copies | Distinct values | Normalized bytes across copies | Distinct normalized bytes |
| --- | ---: | ---: | ---: | ---: |
| Tool-schema sets inside model inputs | 67 | 2 | 276,645 | 8,544 |
| System-role messages inside model inputs | 74 | 5 | 539,175 | 24,665 |

System messages account for about 83% of model-message JSON bytes in this sample. These are logging copies of the inputs the model received; this does not prove unnecessary model input or unnecessary token billing.

Within each model span, provider parameters are also stored as separate attributes alongside `mlflow.spanInputs`. Equivalent standalone input attributes occupy 358,139 serialized-value bytes, of which 311,632 bytes are the second `tools` representation. `mlflow.chat.tools` adds a further 269,638 bytes in a transformed format used for chat rendering. Do not add these numbers to the table as independent projected savings, or remove MLflow rendering fields blindly.

**Recommended target:** retain one usable tool-schema representation per trace/version and remove duplicate provider-parameter copies where the UI permits it. Versioned prompt/schema references could reduce cross-request repetition, but they require reliable immutable snapshot resolution; this is a larger change than suppressing streaming events. Keep exact prompt visibility until that replacement exists.

## Exceptions that rule out blanket artifact deletion

1. **A cancelled response exists only in its artifact among the inspected model outputs.** Run `e5c034e9b89b420fb0807b750852eae3` retains 939 assistant characters, while its linked model output has empty content. The run has `ok=0`, `history_saved=0`, and a cancellation artifact. Preserve this fallback.
2. **Four history files differ from model-message content.** Two differ in an assistant message and two in a system message. The recorded run IDs and roles are in the statistics file; the precise transformation was not diagnosed. Do not label all histories byte-for-byte duplicates.
3. **Tool data is recorded differently across environments.** A shared reader or cleanup projection must handle both record formats and verify complete inputs/results before removing either representation.
4. **Application status is separate from model status.** Both cancelled prod runs are marked `FINISHED`, and their traces are `OK`. Retain cancellation evidence and put request completion status where the UI can filter it.

## Data exposure and ownership

These records contain full chat content, prompts, tool arguments/results, and user/thread/inventory identifiers. The run-artifact helper redacts credential-shaped keys; it is not conversation anonymization. Five request artifacts have `context.access_token`, and all five values are `[REDACTED]`. No inspected payload matched the selected long secret values from the local environment, and no trace payload matched the JWT-shaped pattern used for this check. These limited checks are not a general guarantee that every possible secret is absent.

`mlflow.openai.autolog()` records provider inputs directly. Its automatic model-span inputs do not pass through the application's `redact_payload` helper. A CA logging cleanup should apply the intended content policy consistently to both paths.

Repository inspection also shows the assistant response and full tool details being written to the application database through `persist_assistant_message`. This is a source-code observation; live database contents were not inspected, and two sampled runs explicitly report unsuccessful history persistence. Do not use presumed database copies to justify deleting those diagnostics.

## Proposed CC-554 implementation scope

1. **Normalize ordinary CA outcomes and tool logging.** One request root with searchable completion/cancellation status; complete structured tool calls/results; one result representation; no empty tool artifact. Leave CNB and scoped workflow behavior untouched.
2. **Reduce normal streaming-event storage.** Preserve final content, complete tool calls and timing summaries first. Keep raw chunks only when explicitly debugging. The measured event-list reduction is the largest opportunity.
3. **Make run artifacts selective.** Keep error/cancellation fallbacks. Remove routine response/history copies only when the authoritative trace content is confirmed available. Consolidate summaries into tags/metrics once parity is verified.
4. **Then address prompt/schema repetition and historical retention.** Preserve readable, resolvable prompt versions. Produce an exact dry-run list by ordinary-CA classification and environment before any deletion. This sample does not establish a retention age or that external MLflow consumers do not use the files.

The first three steps are the practical cleanup recommendation. Reducing logging at its source should precede a historical purge, so the same duplication does not immediately return.

## Evidence and implementation pointers

- [Content-free statistics and event-retention evidence](CC-554-ca-payload-statistics-2026-09-08.json).
- [Original trace map and CSV links](CC-554-ca-mlflow-trace-map.md).
- [Before/after verification](CC-554-ca-before-after-example.md) and [revamped trace JSON](CC-554-ca-revamped-trace-example.json).
- `service/app/utils/streaming_handler.py:123`, `:236`, `:988`, and `:1269`: request/history artifacts, duplicated tool-result representation, and final artifacts/metrics.
- `service/app/utils/mlflow_logging.py:161`, `:449`, and `:555`: autolog initialization, artifact logging, and redaction path.
- `service/app/utils/tool_handler.py:20`: application persistence of assistant response and tool details.
- Installed reference implementation: original checkout's `.venv/Lib/site-packages/mlflow/openai/autolog.py:283`, `:367`, and `:441`; OpenTelemetry `sdk/trace/__init__.py:80`.

The audit phase used read-only searches and authenticated artifact GETs. Payloads
were compared in memory; report files contain only statistics, IDs, schema keys,
and findings. The follow-up implementation added two labelled synthetic MLflow
verification runs but did not rewrite historical data, change retention, deploy,
or update the ticket. Linear still requires reauthentication, so Mirco's exact
ticket wording remains unverified.
