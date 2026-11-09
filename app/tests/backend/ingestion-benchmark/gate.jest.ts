import { describe, expect, it } from "@jest/globals";
import type { Comparison } from "@/backend/ingestion-benchmark/baseline";
import {
  BUDGET_FACTOR,
  RECALL_DROP,
  exitCode,
  forecastUsd,
  gateAgainstBaseline,
} from "@/backend/ingestion-benchmark/gate";
import type { CaseVerdict } from "@/backend/ingestion-benchmark/metrics";
import type {
  CaseResult,
  Prices,
  RunEntry,
} from "@/backend/ingestion-benchmark/report";

const verdict = (partial: Partial<CaseVerdict> = {}): CaseVerdict => ({
  id: "C-001",
  block: "validated",
  eligible: true,
  attempts: 3,
  attemptsPassed: 3,
  casePasses: true,
  exploratory: false,
  recallFailedAsZero: 0.9,
  recallScoredOnly: 0.9,
  totalWithinToleranceAll: true,
  tenXAttempts: 0,
  wrongTotalAttempts: 0,
  warnedWrongTotalAttempts: 0,
  failureModes: {
    scored: 3,
    ocr_error: 0,
    extraction_error: 0,
    truncated: 0,
    zero_rows: 0,
    approve_error: 0,
    readback_error: 0,
  },
  costUsd: null,
  seconds: 3,
  ...partial,
});

const compared = (baseline: CaseVerdict): Comparison => ({
  id: "C-001",
  status: "compared",
  baseline,
  rescored: false,
});

describe("gateAgainstBaseline", () => {
  it("is ok when nothing changed", () => {
    const g = gateAgainstBaseline(verdict(), compared(verdict()), null);
    expect(g.verdict).toBe("ok");
    expect(g.reasons).toEqual([]);
  });

  it("regression: passed before and fails now", () => {
    const g = gateAgainstBaseline(
      verdict({ casePasses: false, attemptsPassed: 2 }),
      compared(verdict()),
      null,
    );
    expect(g.verdict).toBe("regression");
    expect(g.reasons).toHaveLength(1);
  });

  it("regression: recall drops more than the threshold", () => {
    expect(RECALL_DROP).toBe(0.05);
    const drop = gateAgainstBaseline(
      verdict({ recallFailedAsZero: 0.8 }),
      compared(verdict({ recallFailedAsZero: 0.9 })),
      null,
    );
    expect(drop.verdict).toBe("regression");
    const small = gateAgainstBaseline(
      verdict({ recallFailedAsZero: 0.86 }),
      compared(verdict({ recallFailedAsZero: 0.9 })),
      null,
    );
    expect(small.verdict).toBe("ok");
  });

  it("regression: more 10x attempts than the baseline", () => {
    const g = gateAgainstBaseline(
      verdict({ tenXAttempts: 1 }),
      compared(verdict({ tenXAttempts: 0 })),
      null,
    );
    expect(g.verdict).toBe("regression");
    const same = gateAgainstBaseline(
      verdict({ tenXAttempts: 1 }),
      compared(verdict({ tenXAttempts: 1 })),
      null,
    );
    expect(same.verdict).toBe("ok");
  });

  it("error: a non-scored failure appears where the baseline had none", () => {
    const failing = verdict({
      failureModes: { ...verdict().failureModes, scored: 2, truncated: 1 },
    });
    expect(
      gateAgainstBaseline(failing, compared(verdict()), null).verdict,
    ).toBe("error");
    const baselineAlsoFailed = verdict({
      failureModes: { ...verdict().failureModes, scored: 2, truncated: 1 },
    });
    expect(
      gateAgainstBaseline(failing, compared(baselineAlsoFailed), null).verdict,
    ).toBe("ok");
  });

  it("error without a baseline when an attempt did not score", () => {
    const failing = verdict({
      failureModes: { ...verdict().failureModes, scored: 2, ocr_error: 1 },
    });
    const g = gateAgainstBaseline(
      failing,
      { id: "C-001", status: "no baseline", baseline: null, rescored: false },
      null,
    );
    expect(g.verdict).toBe("error");
  });

  it("over budget when cost exceeds the factor times the forecast", () => {
    expect(BUDGET_FACTOR).toBe(3);
    const g = gateAgainstBaseline(
      verdict({ costUsd: 0.31 }),
      compared(verdict()),
      0.1,
    );
    expect(g.verdict).toBe("over budget");
    expect(g.forecastUsd).toBe(0.1);
    expect(
      gateAgainstBaseline(verdict({ costUsd: 0.3 }), compared(verdict()), 0.1)
        .verdict,
    ).toBe("ok");
  });

  it("reports the most severe verdict and lists every reason", () => {
    const g = gateAgainstBaseline(
      verdict({
        casePasses: false,
        costUsd: 1,
        failureModes: { ...verdict().failureModes, scored: 2, truncated: 1 },
      }),
      compared(verdict()),
      0.1,
    );
    expect(g.verdict).toBe("error");
    expect(g.reasons).toHaveLength(3);
  });

  it("stale baseline is ok with a reason", () => {
    const g = gateAgainstBaseline(
      verdict(),
      {
        id: "C-001",
        status: "baseline stale",
        baseline: null,
        rescored: false,
      },
      null,
    );
    expect(g.verdict).toBe("ok");
    expect(g.reasons).toEqual(["baseline stale"]);
  });

  it("no baseline is ok with a reason", () => {
    const g = gateAgainstBaseline(
      verdict(),
      { id: "C-001", status: "no baseline", baseline: null, rescored: false },
      null,
    );
    expect(g.verdict).toBe("ok");
    expect(g.reasons).toEqual(["no baseline"]);
  });
});

describe("exitCode", () => {
  const gate = (verdict: "ok" | "regression" | "error" | "over budget") => ({
    id: "C-001",
    verdict,
    reasons: [],
    costUsd: null,
    forecastUsd: null,
    lines: [] as [string, string, string][],
  });

  it("is 1 on regression or error and 0 on ok and over budget", () => {
    expect(exitCode([gate("ok"), gate("regression")])).toBe(1);
    expect(exitCode([gate("error")])).toBe(1);
    expect(exitCode([gate("ok"), gate("over budget")])).toBe(0);
    expect(exitCode([])).toBe(0);
  });
});

describe("forecastUsd", () => {
  const PRICES: Prices = {
    llmInputPerMTok: 1,
    llmOutputPerMTok: 5,
    ocrPerPage: 0.002,
  };

  it("prices the mean tokens of one run", () => {
    const run = (n: number): RunEntry =>
      ({
        run: n,
        ok: true,
        failureMode: "scored",
        warnings: [],
        ms: 1,
        stageMs: { ocr: 0, extraction: 0, import: 0, total: 1 },
        usage: {
          calls: 1,
          promptTokens: 1_000_000,
          completionTokens: 200_000,
          reasoningTokens: 0,
          lengthStops: 0,
          maxCompletionTokens: 0,
        },
      }) as unknown as RunEntry;
    const before = { runs: [run(1), run(2)] } as unknown as CaseResult;
    // Per run: 1M in at $1 + 0.2M out at $5 = $2.
    expect(forecastUsd(before, PRICES)).toBeCloseTo(2, 5);
  });
});
