import { describe, test, expect } from "@jest/globals";
import {
  countMissingInformationMarkers,
  decodeMissingInformationMessage,
  informationMarkerKey,
  missingInformationRanges,
  stripMissingInformationMarkers,
} from "@/components/ConceptNoteWorkspace/draft-markdown";

// Same vectors as climate-advisor/service/tests/cnb/test_information_markers.py:
// the app must pair every marker with the gap record Climate Advisor pairs it with.
const QUESTION = "What is Richfield's local share?";
const SAME_GAP: [string, string][] = [
  ["[Information needed: What is Richfield's local share?]", QUESTION],
  ["[Information needed: **What is Richfield's local share?**]", QUESTION],
  ["[Information needed: What is Richfield's local share]", QUESTION],
  ["[Information needed: What is Richfield’s local share?]", QUESTION],
  ["[Information needed: What is  Richfield's local share?]", QUESTION],
  ["[Information needed: What is Richfield's\nlocal share?]", QUESTION],
  ["[Information needed: What is Richfield's _local_ share?]", QUESTION],
  ["[information needed:What is RICHFIELD'S local share?]", QUESTION],
  [
    "[Information needed: What is Richfield's local share?]",
    `Information needed: ${QUESTION}`,
  ],
];
const OTHER_GAP: [string, string][] = [
  ["[Information needed: What is Richfield's total cost?]", QUESTION],
  ["[Information needed: What is Richfield's local share in 2027?]", QUESTION],
];

describe("marker to gap pairing shared with Climate Advisor", () => {
  test.each(SAME_GAP)(
    "formatting never splits %j from its gap",
    (marker, question) => {
      const [range] = missingInformationRanges(`Text. ${marker} More.`);
      expect(range?.end).toBe(6 + marker.length);
      expect(informationMarkerKey(range!.message)).toBe(
        informationMarkerKey(question),
      );
      expect(informationMarkerKey(marker)).toBe(
        "what is richfield s local share",
      );
    },
  );

  test.each(OTHER_GAP)("%j stays a different gap", (marker, question) => {
    expect(informationMarkerKey(marker)).not.toBe(
      informationMarkerKey(question),
    );
  });

  test("a marker ends at its first closing bracket", () => {
    const body = "[Information needed: Who signs\nthe application?] and [x](y)";
    expect(
      missingInformationRanges(body).map((range) => range.message),
    ).toEqual(["Information needed: Who signs\nthe application?"]);
  });
});

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
