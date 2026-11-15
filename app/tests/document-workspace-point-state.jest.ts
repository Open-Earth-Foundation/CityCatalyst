import { describe, expect, it } from "@jest/globals";
import {
  currentPointCandidate,
  parsePointAnswer,
  pointGroup,
  pointValueText,
} from "@/components/ConceptNoteWorkspace/point-state";
import type { DocumentWorkspacePoint } from "@/util/document-workspace";

const point: DocumentWorkspacePoint = {
  point_id: "point-1",
  key: "project.cost",
  label: "Project cost",
  description: "Total cost in EUR",
  kind: "fact",
  answer_type: "number",
  required: true,
  allow_assumption: false,
  allow_not_applicable: false,
  version: 1,
  status: "missing",
  value: null,
  chapter_refs: ["finance"],
  candidates: [],
  task: null,
  freshness: "missing",
};

describe("document point work groups", () => {
  it("keeps a parked required requirement open rather than covered", () => {
    expect(
      pointGroup({
        ...point,
        task: {
          status: "waiting",
          waiting_for: "Treasurer",
          requested_information: "Approved budget",
          note: null,
        },
      }),
    ).toBe("waiting");
    expect(pointGroup({ ...point, status: "needs_confirmation" })).toBe(
      "confirmation",
    );
    expect(pointGroup({ ...point, status: "conflict" })).toBe("conflict");
  });
  it("distinguishes missing evidence from a pending decision", () => {
    expect(pointGroup(point)).toBe("evidence");
    expect(pointGroup({ ...point, kind: "decision" })).toBe("decision");
  });
  it("only puts accepted answers and explicit exceptions in covered", () => {
    for (const status of ["answered", "assumption", "not_applicable"] as const)
      expect(pointGroup({ ...point, status })).toBe("covered");
  });
});

describe("typed point answers", () => {
  it("preserves zero and decimals but rejects blank, infinite and invalid numbers", () => {
    expect(parsePointAnswer("0", "number")).toBe(0);
    expect(parsePointAnswer("120.5", "number")).toBe(120.5);
    for (const value of ["", "  ", "Infinity", "NaN", "1,200"])
      expect(parsePointAnswer(value, "number")).toBeNull();
  });
  it("keeps ISO dates and free text without coercing numeric-looking choices", () => {
    expect(parsePointAnswer("2027-05-01", "date")).toBe("2027-05-01");
    expect(parsePointAnswer(" 001 ", "choice")).toBe("001");
    expect(parsePointAnswer("  A plan\nwith evidence  ", "multiline")).toBe(
      "A plan\nwith evidence",
    );
  });
  it("renders structured values and false rather than hiding them as empty", () => {
    expect(pointValueText(false)).toBe("false");
    expect(pointValueText(0)).toBe("0");
    expect(pointValueText({ amount: 0 })).toBe('{"amount":0}');
    expect(pointValueText(null)).toBe("");
  });
});

it("keeps waiting work visible even when an accepted value remains covered", () => {
  expect(
    pointGroup({
      ...point,
      status: "answered",
      value: 100,
      task: {
        status: "waiting",
        waiting_for: "Treasurer",
        requested_information: "Updated approval",
        note: null,
      },
    }),
  ).toBe("waiting");
});

it("attributes only the current immutable candidate and never a manual same-value correction", () => {
  const old = {
    candidate_id: "old",
    value: 400000,
    status: "accepted" as const,
    citations: [
      {
        source_label: "Old.pdf",
        quote: "400000",
        page_number: 1,
        source_anchor: null,
      },
    ],
  };
  const latest = {
    ...old,
    candidate_id: "latest",
    value: 420000,
    citations: [
      { ...old.citations[0], source_label: "New.md", quote: "420000" },
    ],
  };
  const accepted = {
    ...point,
    value: 420000,
    status: "answered" as const,
    accepted_candidate_id: "latest",
    candidates: [old, latest],
  };
  expect(currentPointCandidate(accepted)).toEqual(latest);
  expect(
    currentPointCandidate({ ...accepted, accepted_candidate_id: null }),
  ).toBeUndefined();
  expect(
    currentPointCandidate({ ...accepted, accepted_candidate_id: undefined }),
  ).toEqual(latest);
  expect(
    currentPointCandidate({ ...accepted, accepted_candidate_id: "missing" }),
  ).toBeUndefined();
});
