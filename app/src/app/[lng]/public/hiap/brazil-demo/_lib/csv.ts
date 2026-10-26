/** Download rows as a UTF-8 CSV (with BOM, so Excel reads accents). */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
): void {
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const text = [headers, ...rows]
    .map((r) => r.map(escape).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
