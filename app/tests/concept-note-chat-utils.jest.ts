import { describe, expect, it } from "@jest/globals";

import { readConceptNoteThreadMessages } from "@/components/ConceptNoteWorkspace/chat-utils";

describe("Concept Note chat helpers", () => {
  it("keeps persisted user and assistant messages", () => {
    expect(
      readConceptNoteThreadMessages({
        messages: [
          { message_id: "message-1", role: "user", text: "Start thin" },
          {
            message_id: "message-2",
            role: "assistant",
            text: "We can start with the available context.",
          },
        ],
      }),
    ).toEqual([
      { id: "message-1", role: "user", text: "Start thin" },
      {
        id: "message-2",
        role: "assistant",
        text: "We can start with the available context.",
      },
    ]);
  });

  it("drops malformed and unsupported messages", () => {
    expect(
      readConceptNoteThreadMessages({
        messages: [
          null,
          { role: "system", text: "internal" },
          { role: "user", text: 12 },
        ],
      }),
    ).toEqual([]);
    expect(readConceptNoteThreadMessages({})).toEqual([]);
  });
});
