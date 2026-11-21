import { editProposalRequestSchema } from "@/util/concept-note-edit-types";

const request = (scope: object) => ({
  instruction: "Shorten the summary.",
  scope,
  idempotency_key: "4f8e3b9a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
});

// Refining sends back the scope Climate Advisor returned with the proposal.
it("accepts a returned scope that answers no gap", () => {
  expect(
    editProposalRequestSchema.safeParse(
      request({
        kind: "auto",
        focused_chapter_id: null,
        gap_id: null,
        gap_version: null,
        answer_complete: false,
      }),
    ).success,
  ).toBe(true);
});

it("accepts a gap-form answer bound to its gap version", () => {
  expect(
    editProposalRequestSchema.safeParse(
      request({
        kind: "auto",
        focused_chapter_id: "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b",
        gap_id: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
        gap_version: 2,
        answer_complete: true,
      }),
    ).success,
  ).toBe(true);
});
