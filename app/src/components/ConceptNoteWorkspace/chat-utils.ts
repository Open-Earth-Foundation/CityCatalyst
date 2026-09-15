export interface ConceptNoteChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

export interface ConceptNoteReasoning {
  id: string;
  stage: "chat" | "planning" | "reviewing";
  chapterTitle?: string;
  text: string;
}

/** Only display complete model-authored headings, never half-written Markdown. */
export function readReasoningHeading(text: string): string | null {
  const headings = [
    ...text.matchAll(/^(?:\*\*([^\n]+?)\*\*|#{1,6}\s+([^\n]+)\n)/gm),
  ];
  const latest = headings.at(-1);
  return latest ? (latest[1] || latest[2]).trim() : null;
}

export function readConceptNoteReasoning(
  value: unknown,
): ConceptNoteReasoning | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.delta !== "string" ||
    !value.delta ||
    (value.stage !== "chat" &&
      value.stage !== "planning" &&
      value.stage !== "reviewing")
  )
    return null;
  return {
    id: value.id,
    stage: value.stage,
    chapterTitle:
      typeof value.chapter_title === "string" ? value.chapter_title : undefined,
    text: value.delta,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readConceptNoteThreadMessages(
  payload: unknown,
): ConceptNoteChatMessage[] {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) {
    return [];
  }

  return payload.messages.flatMap((message) => {
    if (!isRecord(message)) {
      return [];
    }
    const role = message.role;
    const text = message.text;
    if ((role !== "assistant" && role !== "user") || typeof text !== "string") {
      return [];
    }
    return [
      {
        id:
          typeof message.message_id === "string"
            ? message.message_id
            : crypto.randomUUID(),
        role,
        text,
      },
    ];
  });
}

const stages = [
  "preparing",
  "planning",
  "reviewing",
  "chapter_completed",
  "validating",
  "responding",
] as const;
export interface ConceptNoteProgress {
  stage: (typeof stages)[number];
  chapterTitle?: string;
  completed?: number;
  total?: number;
}

export function readConceptNoteProgress(
  value: unknown,
): ConceptNoteProgress | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("stage" in value) ||
    !stages.some((stage) => stage === value.stage)
  )
    return null;
  const data = value as Record<string, unknown>;
  return {
    stage: data.stage as ConceptNoteProgress["stage"],
    chapterTitle:
      typeof data.chapter_title === "string" ? data.chapter_title : undefined,
    completed:
      typeof data.completed === "number" &&
      Number.isInteger(data.completed) &&
      data.completed >= 0
        ? data.completed
        : undefined,
    total:
      typeof data.total === "number" &&
      Number.isInteger(data.total) &&
      data.total > 0
        ? data.total
        : undefined,
  };
}
