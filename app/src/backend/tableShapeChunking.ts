/**
 * Pure helpers for Path B table-shape chunk planning.
 * Used by interpret route to size LLM shape batches without silent truncation.
 */

/** Default max chunks (legacy hard cap); adaptive planning never goes below this for small files. */
export const BASE_MAX_TABLE_SHAPE_CHUNKS = 15;

/** Hard ceiling to bound LLM cost/time on very large sheets. */
export const ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS = 40;

export type ShapeChunkPlan = {
  chunkSize: number;
  maxChunks: number;
  totalRows: number;
  /** Chunks required to cover every row at chunkSize (may exceed maxChunks). */
  chunksNeeded: number;
  /** True when some rows fall beyond maxChunks * chunkSize. */
  truncated: boolean;
  /** Row count that will be sent to the LLM under this plan. */
  coveredRows: number;
};

/**
 * Computes how many shape chunks to allow for a sheet of totalRows.
 * Grows from BASE up to ABSOLUTE so medium files are fully covered when possible.
 *
 * @param totalRows - Data rows on the primary sheet (excluding header)
 * @param chunkSize - Max data rows per chunk
 * @returns Allowed chunk count in [BASE, ABSOLUTE]
 */
export function computeMaxTableShapeChunks(
  totalRows: number,
  chunkSize: number,
): number {
  if (totalRows <= 0 || chunkSize <= 0) {
    return BASE_MAX_TABLE_SHAPE_CHUNKS;
  }
  const needed = Math.ceil(totalRows / chunkSize);
  return Math.min(
    ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS,
    Math.max(BASE_MAX_TABLE_SHAPE_CHUNKS, needed),
  );
}

/**
 * Plans chunk coverage for Path B shape extraction.
 *
 * @param totalRows - Data rows on the primary sheet
 * @param chunkSize - Max data rows per chunk
 */
export function planTableShapeChunks(
  totalRows: number,
  chunkSize: number,
): ShapeChunkPlan {
  const safeRows = Math.max(0, totalRows);
  const safeSize = Math.max(1, chunkSize);
  const maxChunks = computeMaxTableShapeChunks(safeRows, safeSize);
  const chunksNeeded = safeRows === 0 ? 0 : Math.ceil(safeRows / safeSize);
  const truncated = chunksNeeded > maxChunks;
  const coveredRows = Math.min(safeRows, maxChunks * safeSize);
  return {
    chunkSize: safeSize,
    maxChunks,
    totalRows: safeRows,
    chunksNeeded,
    truncated,
    coveredRows,
  };
}
