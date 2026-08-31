import { describe, expect, it } from "@jest/globals";

import { readConceptNoteThreadMessages } from "@/components/ConceptNoteWorkspace/chat-utils";

describe("Concept Note chat helpers", () => {
  it("keeps supported messages and drops malformed entries", () => {
    expect(
      readConceptNoteThreadMessages({
        messages: [
          { message_id: "message-1", role: "user", text: "Start thin" },
          {
            message_id: "message-2",
            role: "assistant",
            text: "We can start with the available context.",
          },
          null,
          { role: "system", text: "internal" },
          { role: "user", text: 12 },
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
    expect(readConceptNoteThreadMessages({})).toEqual([]);
  });
});
