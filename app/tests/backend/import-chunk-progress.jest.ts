import { readImportChunkProgress } from "@/util/import-chunk-progress";

describe("readImportChunkProgress", () => {
  it("returns null when mappingConfiguration is missing", () => {
    expect(readImportChunkProgress(undefined)).toBeNull();
    expect(readImportChunkProgress(null)).toBeNull();
    expect(readImportChunkProgress({})).toBeNull();
  });

  it("returns null when total is missing or ≤ 1 (indeterminate UX)", () => {
    expect(
      readImportChunkProgress({ extractionProgress: { current: 1 } }),
    ).toBeNull();
    expect(
      readImportChunkProgress({
        extractionProgress: { current: 1, total: 1 },
      }),
    ).toBeNull();
    expect(
      readImportChunkProgress({
        extractionProgress: { current: 0, total: 0 },
      }),
    ).toBeNull();
  });

  it("returns current/total when total > 1 (determinate UX)", () => {
    expect(
      readImportChunkProgress({
        extractionProgress: { current: 2, total: 3 },
      }),
    ).toEqual({ current: 2, total: 3 });
  });
});
