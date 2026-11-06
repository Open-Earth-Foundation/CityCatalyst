/**
 * Unit tests for the incremental-run gate, plus the gate itself when
 * INGESTION_GATE=1:
 *
 *   INGESTION_GATE=1 \
 *   INGESTION_GATE_BEFORE=<before>/results.json \
 *   INGESTION_GATE_ROOT=<folder with the candidate run folders> \
 *   INGESTION_GATE_AFTER=<run folder; default: newest under the root> \
 *   INGESTION_GATE_SPEND_ROOTS=<root>,<other candidate roots> \
 *   INGESTION_GATE_CAP=40 \
 *   NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test \
 *   npx jest tests/ingestion-accuracy/gate --coverage=false
 *
 * Prints the gate and writes gate.md into the run folder.
 */
import { describe, expect, it } from "@jest/globals";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forecastUsd, gateCase, renderGate, spendUnder } from "./gate";
import type { CaseResult, Prices, RunEntry, RunSummary } from "./report";
import type { FileScore } from "./score";

const PRICES: Prices = {
  llmInputPerMTok: 1,
  llmOutputPerMTok: 5,
  ocrPerPage: 0.002,
};

const score = (partial: Partial<FileScore>): FileScore => ({
  keyValueRows: 10,
  storedGroups: 10,
  matchedRows: 10,
  rowRecall: 1,
  rowPrecision: 1,
  subsectorRecall: 1,
  valueAccuracy: 1,
  classificationAccuracy: 1,
  expectedTotal: 1000,
  storedTotal: 1000,
  totalDiffPct: 0,
  totalWithinTolerance: true,
  notationScored: 0,
  notationRecovered: 0,
  distractorsStored: [],
  unexpectedStored: [],
  missingRows: [],
  ...partial,
});

const run = (n: number, partial: Partial<RunEntry> = {}): RunEntry => ({
  run: n,
  ok: true,
  ms: 30_000,
  extractedRows: 10,
  stored: [],
  score: score({}),
  usage: { calls: 10, promptTokens: 100_000, completionTokens: 10_000 },
  ...partial,
});

const result = (runs: RunEntry[], pages = 10): CaseResult => ({
  id: "C-010",
  file: "Toronto - 2020.pdf",
  kind: "pdf",
  targetYear: 2020,
  keyId: "C-010",
  ocr: { ok: true, code: null },
  productFlowFailsAtOcr: false,
  runs,
  stableTotal: true,
  ocrUsage: { calls: 0, promptTokens: 0, completionTokens: 0, pages },
});

const before = () => result([run(1), run(2), run(3)]);

describe("forecastUsd", () => {
  it("prices the mean Before tokens of one run plus OCR", () => {
    // 100k in at $1 + 10k out at $5 + 10 pages at $0.002
    expect(forecastUsd(before(), PRICES)).toBeCloseTo(0.1 + 0.05 + 0.02);
  });
});

describe("gateCase", () => {
  it("is ok when nothing changed", () => {
    const gate = gateCase(result([run(1)]), before(), PRICES);
    expect(gate.verdict).toBe("ok");
    expect(gate.reasons).toEqual([]);
  });

  it("is a regression when recall drops more than 5 points", () => {
    const after = result([run(1, { score: score({ rowRecall: 0.9 }) })]);
    expect(gateCase(after, before(), PRICES).verdict).toBe("regression");
  });

  it("is a regression when the total leaves the tolerance it met", () => {
    const after = result([
      run(1, {
        score: score({ totalDiffPct: 2, totalWithinTolerance: false }),
      }),
    ]);
    expect(gateCase(after, before(), PRICES).verdict).toBe("regression");
  });

  it("is an error on a failed page or a call cut at the limit", () => {
    expect(
      gateCase(result([run(1, { failedPages: [12] })]), before(), PRICES)
        .verdict,
    ).toBe("error");
    expect(
      gateCase(
        result([
          run(1, {
            usage: {
              calls: 10,
              promptTokens: 100_000,
              completionTokens: 10_000,
              lengthStops: 1,
            },
          }),
        ]),
        before(),
        PRICES,
      ).verdict,
    ).toBe("error");
  });

  it("is over budget above 3 times the forecast", () => {
    const after = result([
      run(1, {
        usage: { calls: 10, promptTokens: 100_000, completionTokens: 200_000 },
      }),
    ]);
    const gate = gateCase(after, before(), PRICES);
    expect(gate.verdict).toBe("over budget");
    expect(gate.costUsd).toBeCloseTo(0.1 + 1 + 0.02);
  });

  it("reports the most severe verdict and every reason", () => {
    const after = result([
      run(1, {
        failedPages: [3],
        score: score({ rowRecall: 0.5 }),
      }),
    ]);
    const gate = gateCase(after, before(), PRICES);
    expect(gate.verdict).toBe("error");
    expect(gate.reasons).toHaveLength(2);
  });
});

describe("renderGate and spendUnder", () => {
  const summary = (results: CaseResult[], runsPerFile: number): RunSummary => ({
    measuredAt: "2026-10-29T13:00:00.000Z",
    commit: "abc1234",
    branch: "test",
    extractionModel: "openai/gpt-6.1-terra",
    prices: PRICES,
    runsPerFile,
    results,
  });

  it("renders one section per case with the spend", () => {
    const { text, gates } = renderGate({
      after: summary([result([run(1)])], 1),
      before: summary([before()], 3),
      spentUsd: 1.5,
      capUsd: 40,
    });
    expect(gates[0].verdict).toBe("ok");
    expect(text).toContain("## C-010: ok");
    expect(text).toContain("$1.500 of the $40 cap");
  });

  it("adds up the cost of every run folder", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-"));
    try {
      for (const name of ["a", "b"]) {
        mkdirSync(join(root, name));
        writeFileSync(
          join(root, name, "results.json"),
          JSON.stringify(summary([result([run(1)])], 1)),
        );
      }
      expect(spendUnder(root)).toBeCloseTo(2 * (0.1 + 0.05 + 0.02));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const RUN = process.env.INGESTION_GATE === "1";

(RUN ? describe : describe.skip)("gate on a real run", () => {
  it("prints the gate", () => {
    const root = process.env.INGESTION_GATE_ROOT!;
    const folder =
      process.env.INGESTION_GATE_AFTER ??
      join(
        root,
        readdirSync(root)
          .filter((name) => existsSync(join(root, name, "results.json")))
          .sort()
          .at(-1)!,
      );
    const after = JSON.parse(
      readFileSync(join(folder, "results.json"), "utf8"),
    ) as RunSummary;
    const before = JSON.parse(
      readFileSync(process.env.INGESTION_GATE_BEFORE!, "utf8"),
    ) as RunSummary;
    const { text } = renderGate({
      after,
      before,
      spentUsd: (process.env.INGESTION_GATE_SPEND_ROOTS ?? root)
        .split(",")
        .reduce((sum, path) => sum + spendUnder(path), 0),
      capUsd: Number(process.env.INGESTION_GATE_CAP ?? 40),
    });
    writeFileSync(join(folder, "gate.md"), text);
    console.log(text);
    expect(text.length).toBeGreaterThan(0);
  });
});
