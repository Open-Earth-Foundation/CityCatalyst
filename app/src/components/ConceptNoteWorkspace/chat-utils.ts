export interface ConceptNoteChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

export interface ConceptNoteReasoning {
  id: string;
  stage: "chat" | "planning" | "reviewing" | "reading";
  replace?: boolean;
  chapterTitle?: string;
  text: string;
}

/** Preview the latest provider text immediately; only strip heading delimiters. */
export function readReasoningPreview(text: string): string {
  const latest =
    text
      .split(/\n\s*\n/)
      .filter((part) => part.trim())
      .at(-1) || "";
  return latest
    .trim()
    .replace(/^#{1,6}\s+|^\*{1,2}/, "")
    .replace(/\*{1,2}$/, "");
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
      value.stage !== "reviewing" &&
      value.stage !== "reading")
  )
    return null;
  return {
    id: value.id,
    stage: value.stage,
    chapterTitle:
      typeof value.chapter_title === "string" ? value.chapter_title : undefined,
    text: value.delta,
    replace: value.replace === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Server-owned trigger text stored for hidden turns; never shown as user text.
const HIDDEN_TURN_MARKERS = [
  "CONCEPT_NOTE_DRAFT_OVERVIEW_REQUEST",
  "CONCEPT_NOTE_SOURCE_REVIEW_REQUEST",
];

function isHiddenTurnRequest(text: string): boolean {
  const trimmed = text.trimStart();
  return HIDDEN_TURN_MARKERS.some((marker) => trimmed.startsWith(marker));
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
    if (role === "user" && isHiddenTurnRequest(text)) {
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
  // Client-only stages for the hidden drafting-overview and source-review turns.
  stage: (typeof stages)[number] | "summarizing_draft" | "reviewing_sources";
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
