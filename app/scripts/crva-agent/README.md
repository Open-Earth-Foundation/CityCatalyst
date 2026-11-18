# crva-agent

Prototype: agentic CRVA extractor on the OpenAI Agents SDK, compared against the CRVA adapter v0 with the CC-1285 eval harness. Isolated package: `@openai/agents` is installed only here, never in `app/package.json`.

Setup (Node 22+, Docker Desktop running):

```bash
cd app/scripts/crva-agent
npm install
docker build -t crva-agent-sandbox:1 .
docker run --rm crva-agent-sandbox:1 tesseract --list-langs   # expect eng and spa
```

The image is `python:3.12-slim` plus tesseract (eng, spa), poppler-utils and pymupdf 1.24. The SDK Docker client needs only `/bin/sh`, GNU tar and coreutils (`realpath`) in the image; the base image has them, so nothing extra is installed. No `bash`, user or sudo is required.

## SDK notes

Verified against the installed types: `@openai/agents@0.22.0` (`@openai/agents-core@0.22.0`, `openai@7.59.0`, deduped, own lockfile).

### Imports

- Core: `import { Agent, run, Usage, MaxTurnsExceededError } from '@openai/agents'` (re-exports `@openai/agents-core` and `@openai/agents-openai`).
- Sandbox: `import { SandboxAgent, Manifest, localDir, dir, file, filesystem, shell, Capabilities, addSandboxEventSink } from '@openai/agents/sandbox'` (re-exports `@openai/agents-core/sandbox`).
- Docker client: `import { DockerSandboxClient } from '@openai/agents/sandbox/local'`. The `local` export holds both the Docker and the Unix-local clients (the latter is not used on Windows); `@openai/agents/sandbox` does not export `DockerSandboxClient`.

### SandboxAgent

`new SandboxAgent(options)`: normal `Agent` options plus sandbox ones.

- From `Agent`: `name`, `model: string | Model`, `modelSettings`, `instructions: string | fn`, `outputType` (zod or JSON schema; result in `result.finalOutput`), `tools`.
- Sandbox: `defaultManifest?: Manifest | ManifestInit`, `baseInstructions?: string | fn`, `capabilities?: Capability[]`, `runAs?: string | { name }`.
- Capabilities: `filesystem()` (file view/edit tools), `shell()` (shell tool, runs `/bin/sh -lc`), `compaction(...)`, `memory(...)`, `skills(...)`; each takes optional `{ configureTools }`. `Capabilities.default()` returns the default set. Use `shell()` and `filesystem()`.

### Manifest and local directories

- `new Manifest({ root?, entries?, environment?, users?, groups?, extraPathGrants? })`. Default `root` is `/workspace` (container path, bind-mounted from a host temp dir; also the container working dir).
- `entries` maps a workspace-relative path to an entry. Factories: `localDir({ src })` copies a host directory into the workspace (`{ type: 'local_dir', src }`), `localFile({ src })`, `file({ content })`, `dir({ children })`, `gitRepo(...)`, mounts. Entry options: `description`, `ephemeral`, `permissions`, `group`.
- `localDir` and `localFile` only accept a `src` under `process.cwd()` or under a `manifest.extraPathGrants` entry (which the Docker client bind-mounts into the container); anything else fails in `create()` with `local_dir source must stay within the local source base directory`. `agent.ts` therefore reads the host workspace itself and passes inline `dir({ children })` and `file({ content })` entries (content may be a `Uint8Array`); an empty `dir({ children: {} })` gives the empty `output/`.
- `environment` entries become container env vars (`-e`). Never put API keys there.

### DockerSandboxClient

```ts
new DockerSandboxClient({
  image: "crva-agent-sandbox:1", // default is python:3.14-slim
  networkMode: "none", // the only valid value; omit for the default bridge network
  labels,
  exposedPorts,
  workspaceBaseDir,
  snapshot,
  concurrencyLimits,
  archiveLimits,
});
```

- Image: the `image` option. A different image invalidates resumed session state.
- `networkMode: 'none'` removes network access. The agent needs none, so set it.
- The container starts with `docker run -d ... /bin/sh -c "sleep loop"`. The user is host uid:gid when `process.getuid` exists; on Windows it is undefined, so the container runs as the image default (root). File APIs run via `docker exec` with `/bin/sh -lc`, GNU tar and `realpath`.
- Archive limits: `archiveLimits` (client option, create arg or `sandbox.archiveLimits`) takes `{ maxInputBytes, maxExtractedBytes, maxMembers }`. The defaults (`DEFAULT_SANDBOX_ARCHIVE_LIMITS`: 1 GiB input, 4 GiB extracted, 100,000 members) already accept the full 41.2 MiB Buenos Aires PDF as an inline `file` entry (checked: created in about 3 s, 43,219,534 bytes and 185 pages inside the container), so `agent.ts` sets none.
- Methods: `create({ manifest, options? })` or `create(manifest, options?)` returns a `DockerSandboxSession`; `resume(state)`. The Docker client has no `delete`; `session.close()` (also reached by `session.delete()` and `shutdown()`) removes the container, its volumes and the host workspace copy.

### run()

```ts
const result = await run(agent, 'user prompt', {
  maxTurns: 150,        // number | null; exceeding it throws MaxTurnsExceededError
  signal: abortSignal,  // AbortSignal, e.g. AbortSignal.timeout(ms) for the timeout cap
  sandbox: { client, options?, session?, manifest?, cwd? },
});
```

- `sandbox.client`: the SDK creates (and later closes) the session from `agent.defaultManifest` or `sandbox.manifest`.
- `sandbox.session`: inject a session we created with `client.create(...)`.
- `sandbox.cwd`: workspace-relative working dir for the shell tool.
- Also: `context`, `session` (conversation memory), `stream: true`, `errorHandlers`, `callModelInputFilter`, `toolErrorFormatter`.

### Tracing

The SDK exports traces of every run to the OpenAI platform by default. `agent.ts` calls `setTracingDisabled(true)` (from `@openai/agents`) before each run, so report text and tool output are not uploaded. `new Runner({ tracingDisabled: true })` is the per-runner alternative; the global switch also covers sandbox spans outside the runner.

### Token usage and tool calls

- Usage: `result.state.usage` is a `Usage` with `requests`, `inputTokens`, `outputTokens`, `totalTokens`, `inputTokensDetails[]`, `outputTokensDetails[]` (cached and reasoning counts live in these detail records) and `requestUsageEntries[]`. `RunResult` has no top-level `usage`; read it from `state`. Per-response usage is also on `result.rawResponses[i].usage`.
- Tool calls: count `result.newItems.filter((i) => i.type === 'tool_call_item')` (`RunToolCallItem`; outputs are `tool_call_output_item`). This counts every tool.
- Sandbox events: `addSandboxEventSink(sink)` returns an unsubscribe function. Events: `{ type: 'sandbox_operation', name, phase: 'start' | 'end' | 'error', timestamp, durationMs?, data?, error? }`. Names in the code: `sandbox.create_session`, `sandbox.start`, `sandbox.exec`, `sandbox.write_stdin`, `sandbox.view_image`, `sandbox.shutdown`, `sandbox.cleanup`. Counting `sandbox.exec` with `phase: 'end'` counts shell commands only.
- `usage.requests` is the number of model calls (one per turn).

### Reading output back from the workspace

`DockerSandboxSession.readFile({ path, maxBytes? })` returns `Promise<Uint8Array>` (the generic interface types it `string | Uint8Array`). Other session methods: `listDir({ path })`, `pathExists(path)`, `directoryExists(path)`, `exec(...)`, `persistWorkspace()` (tar of the workspace), `close()`, `delete()`.

Confirmed in the Task 5 smoke run (2026-11-18):

- An injected session (`sandbox: { session }`) is not owned by the run: the SDK applies only an additive manifest delta and does not close it, so `pathExists` and `readFile` work after `run()` returns. We close it in `finally`.
- `readFile` and `pathExists` accept workspace-relative paths (`output/values.jsonl`) as well as `/workspace/...`. A missing file makes `pathExists` return `false`; `readFile` throws `SandboxWorkspaceReadNotFoundError`.
- Usage: `agent.ts` passes its own `context: new RunContext()` to `run()` and reads `context.usage` afterwards, so the counts survive a throw (from `run.mjs`: a passed `RunContext` is used as is; `MaxTurnsExceededError.state` exists, but an abort error has no state). Tool calls are counted with `agent.on('agent_tool_start', ...)` for the same reason. The throw path was not exercised by the smoke run.

### Not settled by the types

- The exact keys of `TokenDetails` (cached and reasoning tokens).
- Whether a container survives a killed host process. The SDK labels its containers; clean up stragglers with `docker ps -a --filter label=<ownership label>`.
- Pointing the SDK at a non-default base URL: the default client reads `OPENAI_API_KEY`; a custom one needs `setDefaultOpenAIClient`.
