export interface ConceptNoteChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
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
