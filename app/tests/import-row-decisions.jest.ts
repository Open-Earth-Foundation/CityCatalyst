/**
 * CC-1201: row decisions belong to one uploaded file. Row numbers mean nothing
 * on another file, so a second file must start with no decisions.
 */
import { describe, expect, it } from "@jest/globals";
import {
  decisionsForFile,
  type ImportRowDecision,
  NO_ROW_DECISIONS,
  withRowDecision,
} from "@/components/steps/GHGI/import/import-row-decisions";

const keep: ImportRowDecision = {
  reviewDecision: "keep",
  decisionFileId: "file-a",
  decisionToken: "token-a",
  decisionRef: "III.4.3",
  decisionScope: null,
  decisionValue: 6300,
};

describe("row decisions", () => {
  it("starts a second file with no decisions", () => {
    const state = withRowDecision(NO_ROW_DECISIONS, "file-a", 0, keep);
    expect(decisionsForFile(state, "file-a")).toEqual({ "0": keep });
    expect(decisionsForFile(state, "file-b")).toEqual({});
  });

  it("drops the first file's decisions when the second file gets one", () => {
    const first = withRowDecision(NO_ROW_DECISIONS, "file-a", 0, keep);
    const second = withRowDecision(first, "file-b", 1, keep);
    expect(decisionsForFile(second, "file-b")).toEqual({ "1": keep });
  });

  it("clears one decision", () => {
    const state = withRowDecision(NO_ROW_DECISIONS, "file-a", 0, keep);
    expect(
      decisionsForFile(withRowDecision(state, "file-a", 0, null), "file-a"),
    ).toEqual({});
  });
});
