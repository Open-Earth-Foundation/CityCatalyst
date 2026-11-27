import { expect, it } from "@jest/globals";
import { pointDraftStage } from "@/components/ConceptNoteWorkspace/point-draft-stage";

it("unlocks a point draft when a source was matched despite another upload failure", () => {
  const uploads = [{ status: "failed" }, { status: "ready" }] as const;
  expect(pointDraftStage(true, false, [...uploads])).toBe("matching");
  expect(pointDraftStage(true, true, [...uploads])).toBe("ready");
  expect(pointDraftStage(true, false, [])).toBe("upload");
  expect(pointDraftStage(true, false, [{ status: "processing" }])).toBe("processing");
});
