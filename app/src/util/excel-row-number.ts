/**
 * 1-based Excel row. Data starts at row 2 (row 1 is the header), so a 0-based
 * parsed index maps to index + 2 when the parser did not keep the sheet row.
 */
export function excelRowNumber(
  rowIndex: number,
  sourceRowNumber?: number | null,
): number {
  return sourceRowNumber ?? rowIndex + 2;
}
