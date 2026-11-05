export interface ConceptNoteChatVisual {
  title: string;
  html: string;
}

export interface ConceptNoteChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  visuals?: ConceptNoteChatVisual[];
  choices?: string[];
}

/** The same bounded tool contract is used by the stream and saved history. */
export function readConceptNoteChoices(value: unknown): string[] | undefined {
  if (!isRecord(value) || value.name !== "concept_note_ask_question") return;
  const options = value.options;
  if (
    !Array.isArray(options) ||
    options.length < 2 ||
    options.length > 6 ||
    !options.every(
      (option): option is string =>
        typeof option === "string" && option.trim().length > 0,
    ) ||
    new Set(options.map((option) => option.trim().toLowerCase())).size !==
      options.length
  )
    return;
  return options;
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

/** Model-authored HTML; render it only through the sandboxed visual frame. */
export function readConceptNoteVisual(
  value: unknown,
): ConceptNoteChatVisual | null {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    typeof value.html !== "string" ||
    !value.html
  )
    return null;
  return { title: value.title, html: value.html };
}

/** A live render result keeps only the title; the HTML is in the call arguments. */
export function readConceptNoteToolVisual(
  result: Record<string, unknown>,
): ConceptNoteChatVisual | null {
  if (
    result.action !== "concept_note.visual.render" ||
    result.success !== true ||
    !isRecord(result.data) ||
    !isRecord(result.arguments)
  )
    return null;
  return readConceptNoteVisual({
    title: result.data.title,
    html: result.arguments.html,
  });
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
    const visuals = Array.isArray(message.visuals)
      ? message.visuals.flatMap((visual) => readConceptNoteVisual(visual) ?? [])
      : [];
    return [
      {
        id:
          typeof message.message_id === "string"
            ? message.message_id
            : crypto.randomUUID(),
        role,
        text,
        ...(visuals.length > 0 ? { visuals } : {}),
        ...(role === "assistant" && message.choices
          ? {
              choices: readConceptNoteChoices({
                name: "concept_note_ask_question",
                options: message.choices,
              }),
            }
          : {}),
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
  // `summarizing_draft` is client-only: the hidden drafting-overview turn.
  stage: (typeof stages)[number] | "summarizing_draft";
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
