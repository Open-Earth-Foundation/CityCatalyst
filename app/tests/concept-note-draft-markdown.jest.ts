import { describe, test, expect } from "@jest/globals";
import {
  countMissingInformationMarkers,
  decodeMissingInformationMessage,
  stripMissingInformationMarkers,
} from "@/components/ConceptNoteWorkspace/draft-markdown";

describe("concept note draft missing-information markers", () => {
  test("decodes the full tooltip message", () => {
    const message = "Information needed: Confirm the financing amount.";

    expect(decodeMissingInformationMessage(encodeURIComponent(message))).toBe(
      message,
    );
    expect(decodeMissingInformationMessage("%broken")).toBeNull();
  });

  test("counts and removes missing-information markers for export", () => {
    const markdown = [
      "Known text. [Information needed: Confirm the sponsor.]",
      "[Information needed: Supply the opening date.] More known text.",
    ].join("\n\n");

    expect(countMissingInformationMarkers(markdown)).toBe(2);
    expect(stripMissingInformationMarkers(markdown)).toBe(
      "Known text.\n\nMore known text.",
    );
  });
});
