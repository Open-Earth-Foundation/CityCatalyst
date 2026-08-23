import {
  countMissingInformationMarkers,
  decodeMissingInformationMessage,
  MISSING_INFORMATION_LINK,
  replaceMissingInformationMarkers,
  stripMissingInformationMarkers,
} from "@/components/ConceptNoteWorkspace/draft-markdown";

describe("concept note draft missing-information markers", () => {
  test("replaces a bracketed Information needed message with an indicator link", () => {
    const markdown =
      "The project sponsor is pending. [Information needed: Confirm the project sponsor and PPP structure.]";

    const rendered = replaceMissingInformationMarkers(markdown);

    expect(rendered).toContain(`[ⓘ](${MISSING_INFORMATION_LINK} "`);
    expect(rendered).not.toContain("[Information needed:");
    expect(rendered).toContain(
      encodeURIComponent(
        "Information needed: Confirm the project sponsor and PPP structure.",
      ),
    );
  });

  test("leaves unrelated square-bracket content unchanged", () => {
    const markdown =
      "See [the funding guide](https://example.com) and [Annex A].";

    expect(replaceMissingInformationMarkers(markdown)).toBe(markdown);
  });

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
