// The only file that imports the Agents SDK (installed in this folder only).
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { MaxTurnsExceededError, RunContext, run } from "@openai/agents";
import {
  Capabilities,
  Manifest,
  SandboxAgent,
  dir,
  file,
} from "@openai/agents/sandbox";
// The Docker client ships in the "local" export, next to the Unix-local one (unused).
import { DockerSandboxClient } from "@openai/agents/sandbox/local";
import { agentInstructions, type Variant } from "./instructions";
import type { AgentRunResult } from "./run-stats";

export const SANDBOX_IMAGE = "crva-agent-sandbox:1";
const OUTPUT_PATH = "output/values.jsonl";

type Entry = ReturnType<typeof dir> | ReturnType<typeof file>;

/**
 * The host workspace as inline entries. localDir/localFile only accept sources under
 * process.cwd() or an extraPathGrants bind mount, so the content is read here instead.
 */
async function readEntries(hostDir: string): Promise<Record<string, Entry>> {
  const entries: Record<string, Entry> = {};
  for (const entry of await readdir(hostDir, { withFileTypes: true })) {
    const hostPath = path.join(hostDir, entry.name);
    entries[entry.name] = entry.isDirectory()
      ? dir({ children: await readEntries(hostPath) })
      : file({ content: await readFile(hostPath) });
  }
  return entries;
}

/**
 * One SandboxAgent run in a fresh Docker container holding a copy of `workspaceDir`.
 * Paid: model calls go to api.openai.com with OPENAI_API_KEY. A max-turns or timeout cap
 * comes back as `error`; any other failure throws. The container is removed afterwards.
 */
export async function runAgent(input: {
  variant: Variant;
  workspaceDir: string;
  pageCount: number;
  model: string;
  maxTurns: number;
  timeoutMs: number;
}): Promise<AgentRunResult> {
  const client = new DockerSandboxClient({
    image: SANDBOX_IMAGE,
    networkMode: "none",
  });
  // We own the session so the workspace outlives run() and we can read the output.
  const session = await client.create({
    manifest: new Manifest({ entries: await readEntries(input.workspaceDir) }),
  });

  // The manifest lives on the session; the agent gets none, so the SDK applies no delta.
  const agent = new SandboxAgent({
    name: "crva-extractor",
    model: input.model,
    instructions: agentInstructions(input.variant, input.pageCount),
    capabilities: Capabilities.default(),
  });
  let toolCalls = 0;
  agent.on("agent_tool_start", () => {
    toolCalls += 1;
  });

  // A RunContext we hold keeps the usage even when run() throws.
  const context = new RunContext();
  const signal = AbortSignal.timeout(input.timeoutMs);
  let error: string | undefined;
  try {
    try {
      await run(agent, "Extract the CRVA fields from the report.", {
        maxTurns: input.maxTurns,
        signal,
        context,
        sandbox: { session },
      });
    } catch (err) {
      if (err instanceof MaxTurnsExceededError) {
        error = `max turns ${input.maxTurns}`;
      } else if (signal.aborted) {
        error = `timeout ${input.timeoutMs / 60_000} min`;
      } else {
        throw err;
      }
    }
    const outputText = (await session.pathExists(OUTPUT_PATH))
      ? new TextDecoder().decode(await session.readFile({ path: OUTPUT_PATH }))
      : null;
    return {
      outputText,
      usage: {
        promptTokens: context.usage.inputTokens,
        completionTokens: context.usage.outputTokens,
      },
      modelTurns: context.usage.requests,
      toolCalls,
      ...(error ? { error } : {}),
    };
  } finally {
    // Removes the container and its host workspace copy.
    await session.close();
  }
}
