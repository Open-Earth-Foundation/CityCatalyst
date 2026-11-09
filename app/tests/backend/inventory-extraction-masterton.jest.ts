/**
 * CC-1161 regression on real data: the per-page model answers of one Masterton
 * 2021/22 import (Mistral OCR, real extraction model, 2026-11-05), replayed through
 * the whole extraction path. The fixture keeps the answers as recorded; the variants
 * below edit a copy to reproduce the failure modes of the card.
 *
 * Masterton: gross 785,873, forestry -811,512, net -25,639 tCO2e.
 */
import { describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";

type Row = Record<string, unknown>;
type Answers = Record<string, { rows: Row[] }[]>;
const fixture = JSON.parse(
  readFileSync("tests/fixtures/masterton-2021-22-page-responses.json", "utf8"),
) as {
  targetYear: number;
  candidatePages: number[];
  pageText: Record<string, string>;
  responses: Answers;
};

let answers: Answers = {};

// Each page carries a PAGE-n token; the mock answers with that page's recorded
// rows, in call order (the second answer is the page retry).
jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({
    complete: async (args: { messages: { content: string }[] }) => {
      const tokens = [...args.messages[1].content.matchAll(/PAGE-(\d+)\b/g)];
      const queue = tokens.length === 1 ? answers[tokens[0][1]] : undefined;
      const next = queue && (queue.length > 1 ? queue.shift() : queue[0]);
      return { content: JSON.stringify(next ?? { rows: [] }) };
    },
  }),
  LLMError: class LLMError extends Error {},
  LLMErrorCode: { BAD_REQUEST: "BAD_REQUEST" },
}));

const { extractInventoryFromDocument } =
  await import("@/backend/InventoryExtractionService");
const { extractionReviewNotes, reconciliationTargets } =
  await import("@/util/GHGI/extraction-summary");

const GROSS = 785873;
const REMOVALS = -811512;
const NET = -25639;

/** The candidate pages of the report, with the real Mistral OCR text of each page. */
const document = fixture.candidatePages
  .map((n) =>
    [`<!-- page: ${n} -->`, `PAGE-${n}`, fixture.pageText[n]].join("\n"),
  )
  .join("\n\n");

type Edit = (page: string, rows: Row[]) => Row[];

/**
 * Page 15 repeats the waste rows of page 14 under GPC references; its own residue is
 * the IPPU table (7,947). With the repeat the run stops before page 16.
 */
const fixPage15: Edit = (page, rows) =>
  page === "15"
    ? rows.filter((row) => String(row.sector).startsWith("Industrial"))
    : rows;

const isForestry = (row: Row) =>
  String(row.gpcRefNo ?? "").startsWith("V.2") || row.totalCO2e === REMOVALS;

async function importWith(...edits: Edit[]) {
  answers = Object.fromEntries(
    Object.entries(fixture.responses).map(([page, list]) => [
      page,
      list.map(({ rows }) => ({
        rows: edits.reduce((acc, edit) => edit(page, acc), rows),
      })),
    ]),
  );
  const { summary } = await extractInventoryFromDocument(document, {
    targetYear: fixture.targetYear,
  });
  return { summary, notes: extractionReviewNotes(summary) };
}

describe("CC-1161 Masterton 2021/22 replay", () => {
  it("as recorded: the run stops at page 14 and the orphan forestry total warns", async () => {
    const { summary, notes } = await importWith();
    expect(Math.round(summary.importedSum)).toBe(777928);
    expect(summary.selectedPages).toEqual([12, 13, 14]);
    expect(summary.orphanRemovals).toEqual([REMOVALS]);
    expect(notes.removalsWarning).toEqual({
      kind: "orphan",
      removals: REMOVALS,
      net: NET,
    });
  });

  it("a. with the V.2 rows on page 16 it imports the net total, without a warning", async () => {
    const { summary, notes } = await importWith(fixPage15);
    expect(Math.round(summary.importedSum)).toBe(NET + 2);
    expect(summary.selectedPages).toContain(16);
    expect(summary.orphanRemovals ?? []).toEqual([]);
    expect(notes.removalsWarning).toBeNull();
    expect(notes.reconciledPages).toEqual(summary.selectedPages);
  });

  it("b. with page 16 reduced to the -811,512 subtotal it warns about the orphan total", async () => {
    const { summary, notes } = await importWith(fixPage15, (page, rows) =>
      page === "16" ? rows.filter((row) => row.totalCO2e === REMOVALS) : rows,
    );
    expect(Math.round(summary.importedSum)).toBe(GROSS + 2);
    expect(summary.selectedPages).not.toContain(16);
    expect(notes.removalsWarning).toEqual({
      kind: "orphan",
      removals: REMOVALS,
      net: NET,
    });
    expect(notes.reconciledPages).toEqual([]);
  });

  it("c. with forestry gone from every page it warns that the rows reach only the gross", async () => {
    const { summary, notes } = await importWith(fixPage15, (_page, rows) =>
      rows.filter((row) => !isForestry(row)),
    );
    expect(Math.round(summary.importedSum)).toBe(GROSS + 2);
    expect(
      reconciliationTargets(summary.reportedTotals, summary.targetYear).net,
    ).toContain(NET);
    expect(notes.removalsWarning).toEqual({ kind: "gross-only", net: NET });
    expect(notes.reconciledPages).toEqual([]);
  });

  it("c'. with only page 16 gone the summary page still reports forestry: orphan", async () => {
    const { summary, notes } = await importWith(fixPage15, (page, rows) =>
      page === "16" ? [] : rows,
    );
    expect(Math.round(summary.importedSum)).toBe(GROSS + 2);
    expect(notes.removalsWarning?.kind).toBe("orphan");
  });
});
