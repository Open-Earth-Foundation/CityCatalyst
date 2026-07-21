/**
 * Unit tests for Path C document chunking helpers (multi-chunk stress readiness).
 */
import { describe, expect, it } from "@jest/globals";
import {
  mergeAndDedupeRows,
  PATH_C_CHUNK_OVERLAP,
  PATH_C_CHUNK_SIZE,
  PATH_C_CHUNK_THRESHOLD,
  splitIntoChunks,
  type ExtractedRow,
} from "@/backend/InventoryExtractionService";

describe("splitIntoChunks", () => {
  it("returns a single chunk when content fits in one window", () => {
    const content = "a".repeat(1000);
    expect(splitIntoChunks(content, 40_000, 4_000)).toEqual([content]);
  });

  it("produces multiple overlapping chunks above Path C thresholds", () => {
    // Content just over CHUNK_THRESHOLD forces multi-chunk extraction in production.
    const content = "x".repeat(PATH_C_CHUNK_THRESHOLD + 1);
    const chunks = splitIntoChunks(
      content,
      PATH_C_CHUNK_SIZE,
      PATH_C_CHUNK_OVERLAP,
    );
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].length).toBe(PATH_C_CHUNK_SIZE);
    // Overlap: next chunk starts PATH_C_CHUNK_OVERLAP chars before end of previous.
    expect(chunks[1].startsWith(chunks[0].slice(-PATH_C_CHUNK_OVERLAP))).toBe(
      true,
    );
  });
});

describe("mergeAndDedupeRows", () => {
  it("keeps unique rows and drops overlap duplicates", () => {
    const row = (sector: string, totalCO2e: number): ExtractedRow =>
      ({
        sector,
        totalCO2e,
        year: 2022,
      }) as ExtractedRow;
    const a = row("Energy", 10);
    const b = row("Waste", 20);
    const merged = mergeAndDedupeRows([[a, b], [b, row("Transport", 30)]]);
    expect(merged).toHaveLength(3);
  });
});
