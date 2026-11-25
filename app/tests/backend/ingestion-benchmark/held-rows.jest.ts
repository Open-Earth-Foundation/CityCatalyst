import { describe, expect, it } from "@jest/globals";
import {
  heldRowDecisions,
  needsReviewMessage,
  totalInclusionConflicts,
} from "@/backend/ingestion-benchmark/held-rows";
import type { ImportRowReview } from "@/util/types";

const review = (partial: Partial<ImportRowReview>): ImportRowReview =>
  ({
    rowIndex: 0,
    issue: "direction-unconfirmed",
    value: 1200,
    notationKey: null,
    suggestedRefNo: "III.1.1",
    chosenRefNo: "III.1.1",
    scope: "Scope 1",
    finalScope: "Scope 1",
    decisionToken: "tok-0",
    expectedScope: null,
    referenceOptions: [],
    ...partial,
  }) as ImportRowReview;

describe("heldRowDecisions", () => {
  it("keeps a direction-unconfirmed row, bound to what the review screen would show", () => {
    const { decisions, included, unresolved } = heldRowDecisions(
      [review({ rowIndex: 3 })],
      "file-1",
    );
    expect(included).toBe(1);
    expect(unresolved).toBe(0);
    expect(decisions).toEqual({
      "3": {
        reviewDecision: "keep",
        decisionFileId: "file-1",
        decisionToken: "tok-0",
        decisionRef: "III.1.1",
        decisionScope: "Scope 1",
        decisionValue: 1200,
      },
    });
  });

  it("includes a reference-conflict row with the scope the catalogue expects, since keep is disabled for it", () => {
    const { decisions, included } = heldRowDecisions(
      [
        review({
          rowIndex: 5,
          issue: "reference-conflict",
          scope: "Scope 2",
          expectedScope: 1,
        }),
      ],
      "file-1",
    );
    expect(included).toBe(1);
    expect(decisions["5"]).toMatchObject({
      reviewDecision: "correct-scope",
      scope: "1",
      decisionScope: "Scope 2",
    });
  });

  it("reports a conflict row with no expected scope as unresolved and sends no decision for it", () => {
    const { decisions, included, unresolved } = heldRowDecisions(
      [
        review({
          rowIndex: 2,
          issue: "reference-conflict",
          expectedScope: null,
        }),
      ],
      "file-1",
    );
    expect(included).toBe(0);
    expect(unresolved).toBe(1);
    expect(decisions).toEqual({});
  });

  it("sends no decision for rows that disagree on total inclusion", () => {
    // Mirco's I.3.1: 100 t counted and 20 t left out. Keep would count both.
    const { decisions, included, unresolved } = heldRowDecisions(
      [
        review({
          rowIndex: 0,
          issue: "merge-total-inclusion-mixed",
          suggestedRefNo: "I.3.1",
          value: 100,
        }),
        review({
          rowIndex: 1,
          issue: "merge-total-inclusion-mixed",
          suggestedRefNo: "I.3.1",
          value: 20,
        }),
      ],
      "file-1",
    );
    expect(decisions).toEqual({});
    expect(included).toBe(0);
    expect(unresolved).toBe(0);
  });

  it("returns nothing when no row is held", () => {
    expect(heldRowDecisions([], "file-1")).toEqual({
      decisions: {},
      included: 0,
      unresolved: 0,
    });
  });
});

describe("totalInclusionConflicts", () => {
  it("counts the counted and left-out rows per reference", () => {
    expect(
      totalInclusionConflicts([
        { gpcRefNo: "I.3.1", leftOut: false },
        { gpcRefNo: "I.3.1", leftOut: true },
        { gpcRefNo: "II.1.1", leftOut: true },
        { gpcRefNo: "II.1.1", leftOut: false },
        { gpcRefNo: "II.1.1", leftOut: false },
      ]),
    ).toEqual([
      { gpcRefNo: "I.3.1", counted: 1, leftOut: 1 },
      { gpcRefNo: "II.1.1", counted: 2, leftOut: 1 },
    ]);
  });

  it("returns nothing without mixed rows", () => {
    expect(totalInclusionConflicts([])).toEqual([]);
  });
});

describe("needsReviewMessage", () => {
  it("says why the rows were not imported, naming the reference but no value", () => {
    const message = needsReviewMessage([
      { gpcRefNo: "I.3.1", counted: 1, leftOut: 1 },
    ]);
    expect(message).toBe(
      "needs review: rows of one reference disagree on whether they count in the total: I.3.1 (1 counted, 1 left out of the total). The runner does not choose, so nothing is imported and the attempt is not scored.",
    );
  });
});
