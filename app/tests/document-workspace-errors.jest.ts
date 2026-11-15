import { expect, it } from "@jest/globals";
import { documentWorkspaceErrorKind } from "@/components/ConceptNoteWorkspace/workspace-errors";
it("distinguishes source availability from revision conflicts", () => {
  expect(
    documentWorkspaceErrorKind({
      status: 409,
      data: {
        title:
          "A supporting source is unavailable or changed. Review the source-backed answer.",
      },
    }),
  ).toBe("source_unavailable");
  expect(
    documentWorkspaceErrorKind({
      status: 409,
      data: { detail: "Expected revision differs" },
    }),
  ).toBe("stale");
  expect(
    documentWorkspaceErrorKind({
      status: 503,
      data: { title: "Service unavailable" },
    }),
  ).toBe("other");
});
