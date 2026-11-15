import { expect, it } from "@jest/globals";
import { paragraphDiff } from "@/components/ConceptNoteWorkspace/paragraph-diff";
it("keeps common paragraphs normal around one atomic replacement", () => {
  expect(
    paragraphDiff("First.\n\nOld.\n\nLast.", "First.\n\nNew.\n\nLast."),
  ).toEqual([
    { type: "common", text: "First." },
    { type: "change", before: "Old.", after: "New." },
    { type: "common", text: "Last." },
  ]);
});
it("retains insertions, deletions and complete missing-information markers", () => {
  expect(
    paragraphDiff(
      "Same.\n\n[Information needed: date]",
      "Same.\n\n15 March 2027",
    ),
  ).toEqual([
    { type: "common", text: "Same." },
    {
      type: "change",
      before: "[Information needed: date]",
      after: "15 March 2027",
    },
  ]);
  expect(paragraphDiff("Same.", "Added.\n\nSame.")[0]).toEqual({
    type: "change",
    before: "",
    after: "Added.",
  });
  expect(paragraphDiff("Removed.\n\nSame.", "Same.")[0]).toEqual({
    type: "change",
    before: "Removed.",
    after: "",
  });
});
