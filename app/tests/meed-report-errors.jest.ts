import { describe, expect, it } from "@jest/globals";

import { isReportNotFound } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/useMeedReport";

// The distinction this makes is expensive to get wrong: anything it calls
// "not found" triggers a 10-30 s LLM call per selected action.
describe("isReportNotFound", () => {
  it("is true only for a 404", () => {
    expect(isReportNotFound({ status: 404, data: undefined })).toBe(true);
  });

  it("is false for auth and server failures", () => {
    expect(isReportNotFound({ status: 401, data: undefined })).toBe(false);
    expect(isReportNotFound({ status: 500, data: undefined })).toBe(false);
  });

  it("is false for fetch and parse failures, which carry no numeric status", () => {
    expect(isReportNotFound({ status: "FETCH_ERROR", error: "offline" })).toBe(
      false,
    );
    expect(
      isReportNotFound({ status: "PARSING_ERROR", originalStatus: 404 }),
    ).toBe(false);
  });

  it("is false for a plain thrown Error", () => {
    expect(isReportNotFound(new Error("boom"))).toBe(false);
    expect(isReportNotFound(undefined)).toBe(false);
  });
});
