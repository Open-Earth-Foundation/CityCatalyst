/**
 * Unit tests for Path B table shape chunk planning (pure helpers).
 */
import {
  ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS,
  BASE_MAX_TABLE_SHAPE_CHUNKS,
  computeMaxTableShapeChunks,
  planTableShapeChunks,
} from "@/backend/tableShapeChunking";

describe("computeMaxTableShapeChunks", () => {
  it("keeps the legacy base floor for small sheets", () => {
    expect(computeMaxTableShapeChunks(100, 100)).toBe(
      BASE_MAX_TABLE_SHAPE_CHUNKS,
    );
    expect(computeMaxTableShapeChunks(1500, 100)).toBe(
      BASE_MAX_TABLE_SHAPE_CHUNKS,
    );
  });

  it("grows above the base when more chunks are needed", () => {
    expect(computeMaxTableShapeChunks(2000, 100)).toBe(20);
  });

  it("caps at the absolute maximum", () => {
    expect(computeMaxTableShapeChunks(100_000, 100)).toBe(
      ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS,
    );
  });
});

describe("planTableShapeChunks", () => {
  it("marks truncated when rows exceed absolute coverage", () => {
    const plan = planTableShapeChunks(5000, 100);
    expect(plan.maxChunks).toBe(ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS);
    expect(plan.truncated).toBe(true);
    expect(plan.coveredRows).toBe(ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS * 100);
    expect(plan.chunksNeeded).toBe(50);
  });

  it("does not truncate when coverage fits under the adaptive cap", () => {
    const plan = planTableShapeChunks(1800, 100);
    expect(plan.maxChunks).toBe(18);
    expect(plan.truncated).toBe(false);
    expect(plan.coveredRows).toBe(1800);
  });
});
