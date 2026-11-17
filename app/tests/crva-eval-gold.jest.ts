import { afterAll, describe, expect, it } from "@jest/globals";
import Excel from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readGoldWorkbook } from "../scripts/crva-eval/gold";

const dir = mkdtempSync(path.join(tmpdir(), "crva-gold-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const STANDARD_HEADERS = [
  "field_id",
  "What to look for (manual review)",
  "item_key",
  "gold value",
  "page",
  "evidence",
  "status",
  "model value",
  "model evidence",
  "verdict",
  "notes",
];

interface BuildOptions {
  goldHeaders?: string[];
  goldRows?: (unknown[] | null)[];
}

let counter = 0;
async function build(options: BuildOptions = {}): Promise<string> {
  const wb = new Excel.Workbook();
  wb.addWorksheet("README");
  const header = wb.addWorksheet("Header");
  header.addRows([
    ["City", "Buenos Aires"],
    ["PDF file name", "Analisis.pdf"],
    ["PDF pages", 185],
  ]);
  const gold = wb.addWorksheet("Gold");
  gold.addRow(options.goldHeaders ?? STANDARD_HEADERS);
  for (const row of options.goldRows ?? [
    ["f1", "look", "k1", "value 1", "32, 33", "quote", "FOUND", "", "", "", ""],
  ]) {
    gold.addRow(row ?? []);
  }
  const traps = wb.addWorksheet("Traps");
  traps.addRows([
    ["Page", "What it is", "Why a model could take it wrongly"],
    ["145, 152", "Annex", "Looks like body"],
    ["All", "Footer", "Repeats"],
    ["18 vs 84-95", "Summary vs detail", "Duplicated"],
  ]);
  const file = path.join(dir, `gold-${counter++}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

describe("readGoldWorkbook", () => {
  it("reads Gold rows by header name", async () => {
    const wb = await readGoldWorkbook(await build());
    expect(wb.rows).toEqual([
      {
        rowNumber: 2,
        fieldId: "f1",
        itemKey: "k1",
        goldValue: "value 1",
        pages: [32, 33],
        evidence: "quote",
        status: "FOUND",
        notes: "",
        trapNote: false,
      },
    ]);
  });

  it("still reads after a model status column is inserted and headers vary", async () => {
    const headers = [
      "field_id",
      " Item_Key ",
      "gold value",
      "page",
      "evidence",
      "Status",
      "model status",
      "notes",
    ];
    const file = await build({
      goldHeaders: headers,
      goldRows: [
        [
          "f1",
          { richText: [{ text: "k" }, { text: "1" }] },
          5,
          7,
          "ev",
          "PARTIAL",
          "FOUND",
          "n",
        ],
      ],
    });
    const [row] = (await readGoldWorkbook(file)).rows;
    expect(row).toMatchObject({
      itemKey: "k1",
      goldValue: "5",
      pages: [7],
      status: "PARTIAL",
      notes: "n",
    });
  });

  it("skips empty rows and keeps the Sheet row number", async () => {
    const file = await build({
      goldRows: [
        ["f1", "", "k1", "a", "", "", "FOUND"],
        null,
        ["f2", "", "k2", "", "", "", "N/A"],
      ],
    });
    const { rows } = await readGoldWorkbook(file);
    expect(rows.map((r) => [r.fieldId, r.rowNumber])).toEqual([
      ["f1", 2],
      ["f2", 4],
    ]);
    expect(rows[1].pages).toEqual([]);
  });

  it("flags trap notes", async () => {
    const file = await build({
      goldRows: [
        ["f1", "", "k1", "a", "", "", "FOUND", "", "", "", "TRAP: page 18"],
        ["f2", "", "k2", "a", "", "", "FOUND", "", "", "", "plain"],
      ],
    });
    const { rows } = await readGoldWorkbook(file);
    expect(rows.map((r) => r.trapNote)).toEqual([true, false]);
  });

  it("reads Header and Traps", async () => {
    const wb = await readGoldWorkbook(await build());
    expect(wb.pdfFileName).toBe("Analisis.pdf");
    expect(wb.pageCount).toBe(185);
    expect(wb.traps[0]).toEqual({
      pages: [145, 152],
      what: "Annex",
      why: "Looks like body",
    });
    expect(wb.traps[1].pages).toBe("all");
    expect(wb.traps[2].pages).toEqual([
      18, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
    ]);
  });

  it("rejects an unknown status naming the row", async () => {
    const file = await build({
      goldRows: [["f1", "", "k1", "a", "", "", "FOUN"]],
    });
    await expect(readGoldWorkbook(file)).rejects.toThrow(/row 2/);
  });

  it("lists missing required headers", async () => {
    const file = await build({ goldHeaders: ["field_id", "item_key"] });
    await expect(readGoldWorkbook(file)).rejects.toThrow(/gold value.*page/s);
  });
});
