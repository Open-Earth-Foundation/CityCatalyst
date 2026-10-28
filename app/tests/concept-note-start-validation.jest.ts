import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { CONCEPT_NOTE_MAX_UPLOADS } from "@/components/ConceptNoteWiringHarness/utils";
import { conceptNoteStartRequest } from "@/util/validation";

function startRequest(initialUploads: number) {
  return {
    name: "Resilient neighborhoods",
    city_id: randomUUID(),
    idempotency_key: randomUUID(),
    initial_uploads: Array.from({ length: initialUploads }, (_, index) => ({
      upload_id: randomUUID(),
      filename: `${index}.pdf`,
      sha256: "a".repeat(64),
    })),
  };
}

describe("Concept Note start request", () => {
  it("accepts as many initial uploads as a run can hold, and no more", () => {
    expect(CONCEPT_NOTE_MAX_UPLOADS).toBe(10);
    expect(conceptNoteStartRequest.safeParse(startRequest(10)).success).toBe(
      true,
    );

    const tooMany = conceptNoteStartRequest.safeParse(startRequest(11));
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0]?.path).toEqual(["initial_uploads"]);
  });
});
