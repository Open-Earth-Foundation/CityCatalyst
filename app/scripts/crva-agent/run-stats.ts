/** What one agent run returns: its raw output file, usage and caps. */
export interface AgentRunResult {
  /** Content of output/values.jsonl, or null when the agent never wrote it. */
  outputText: string | null;
  usage: { promptTokens: number; completionTokens: number };
  /** Model calls (one per turn). */
  modelTurns: number;
  toolCalls: number;
  /** Set when a cap stopped the run: "max turns <n>" or "timeout <m> min". */
  error?: string;
}
