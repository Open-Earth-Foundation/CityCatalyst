/**
 * Unit tests for bounded async mapPool (Path B/C parallel chunks).
 */
import { describe, expect, it } from "@jest/globals";
import {
  getLlmChunkConcurrency,
  mapPool,
} from "@/backend/asyncPool";

describe("getLlmChunkConcurrency", () => {
  it("defaults to 3 for missing or invalid values", () => {
    expect(getLlmChunkConcurrency(undefined)).toBe(3);
    expect(getLlmChunkConcurrency("")).toBe(3);
    expect(getLlmChunkConcurrency("nope")).toBe(3);
    expect(getLlmChunkConcurrency("0")).toBe(3);
  });

  it("clamps to [1, 8]", () => {
    expect(getLlmChunkConcurrency("1")).toBe(1);
    expect(getLlmChunkConcurrency("5")).toBe(5);
    expect(getLlmChunkConcurrency("99")).toBe(8);
  });
});

describe("mapPool", () => {
  it("returns empty array for empty input", async () => {
    await expect(mapPool([], 3, async (x) => x)).resolves.toEqual([]);
  });

  it("preserves result order when workers finish out of order", async () => {
    const delays = [30, 5, 15];
    const results = await mapPool(delays, 3, async (ms, index) => {
      await new Promise((r) => setTimeout(r, ms));
      return `i${index}`;
    });
    expect(results).toEqual(["i0", "i1", "i2"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await mapPool(items, 2, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return n * 2;
    });
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("fail-fast: rejects and does not start items after the failure window", async () => {
    const started: number[] = [];
    await expect(
      mapPool([0, 1, 2, 3, 4], 2, async (_item, index) => {
        started.push(index);
        await new Promise((r) => setTimeout(r, 10));
        if (index === 1) {
          throw new Error("boom");
        }
        return index;
      }),
    ).rejects.toThrow("boom");

    // With concurrency 2, indices 0 and 1 start first; after fail, later indices must not all run.
    expect(started).toContain(0);
    expect(started).toContain(1);
    expect(started.length).toBeLessThan(5);
  });

  it("invokes onItemComplete with monotonic completed counts", async () => {
    const seen: number[] = [];
    await mapPool([10, 20, 30], 2, async (n) => n, async (completed) => {
      seen.push(completed);
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});
