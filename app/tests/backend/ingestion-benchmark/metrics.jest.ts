import { describe, expect, it } from "@jest/globals";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  GUARDRAIL_FACTOR,
  attemptPasses,
  blockSummaries,
  caseVerdict,
  offByFactor,
} from "@/backend/ingestion-benchmark/metrics";
import type {
  Block,
  CaseResult,
  FailureMode,
  RunEntry,
} from "@/backend/ingestion-benchmark/report";
import type { FileScore } from "@/backend/ingestion-benchmark/score";

const key = { id: "C-001", keyValueRows: 10 } as KeyFile;

function score(partial: Partial<FileScore> = {}): FileScore {
  return {
    keyValueRows: 10,
    storedGroups: 10,
    matchedRows: 10,
    rowRecall: 1,
    rowPrecision: 1,
    subsectorRecall: 1,
    valueAccuracy: 1,
    classificationAccuracy: 1,
    expectedTotal: 1_000_000,
    storedTotal: 1_000_000,
    totalDiffPct: 0,
    totalWithinTolerance: true,
    toleranceSource: "rule",
    notationScored: 0,
    notationRecovered: 0,
    distractorsStored: [],
    unexpectedStored: [],
    missingRows: [],
    ...partial,
  };
}

function entry(
  run: number,
  partial: Partial<RunEntry> = {},
  scorePartial: Partial<FileScore> = {},
): RunEntry {
  return {
    run,
    ok: true,
    ms: 1000,
    failureMode: "scored",
    warnings: [],
    stageMs: { ocr: 100, extraction: 800, import: 100, total: 1000 },
    score: score(scorePartial),
    ...partial,
  };
}

function failed(run: number, failureMode: FailureMode): RunEntry {
  return entry(run, { ok: false, failureMode, score: null });
}

function result(
  runs: RunEntry[],
  partial: Partial<CaseResult> = {},
): CaseResult {
  return {
    id: "C-001",
    file: "a.pdf",
    kind: "pdf",
    targetYear: 2020,
    keyId: "C-001",
    ocr: { ok: true, code: null },
    productFlowFailsAtOcr: false,
    runs,
    stableTotal: true,
    block: "validated",
    eligible: true,
    totalOnly: false,
    ...partial,
  };
}

const three = (...runs: RunEntry[]) => result(runs);

describe("offByFactor", () => {
  it("uses absolute values and symmetric ratios", () => {
    expect(offByFactor(-500_000, -50_000)).toBe(10);
    expect(offByFactor(50, 500)).toBe(10);
    expect(offByFactor(0, 0)).toBe(1);
    expect(offByFactor(0, 5)).toBe(Infinity);
    expect(offByFactor(5, 0)).toBe(Infinity);
  });

  it("guardrail factor is 10", () => {
    expect(GUARDRAIL_FACTOR).toBe(10);
  });
});

describe("attemptPasses", () => {
  it("passes a scored attempt with total within tolerance", () => {
    expect(attemptPasses(entry(1), key)).toBe(true);
  });

  it("fails without a score or when not scored", () => {
    expect(attemptPasses(entry(1, { score: undefined }), key)).toBe(false);
    expect(attemptPasses(failed(1, "zero_rows"), key)).toBe(false);
  });

  it("fails a 10x attempt even with recall 1", () => {
    const tenX = entry(1, {}, { storedTotal: 10_000_000 });
    expect(attemptPasses(tenX, key)).toBe(false);
  });

  it("does not treat factor 9.9 as 10x", () => {
    const e = entry(1, {}, { storedTotal: 9_900_000 });
    expect(attemptPasses(e, key)).toBe(true);
  });

  it("treats a zero stored total against a non-zero expected total as 10x", () => {
    const e = entry(1, {}, { storedTotal: 0 });
    expect(attemptPasses(e, key)).toBe(false);
  });

  it("uses absolute values for negative net totals", () => {
    const e = entry(1, {}, { expectedTotal: -50_000, storedTotal: -500_000 });
    expect(attemptPasses(e, key)).toBe(false);
  });

  it("fails when the scorer says the total is outside tolerance", () => {
    const e = entry(
      1,
      {},
      { totalWithinTolerance: false, storedTotal: 1_200_000 },
    );
    expect(attemptPasses(e, key)).toBe(false);
  });
});

describe("caseVerdict", () => {
  it("passes only when all 3 attempts pass", () => {
    const v = caseVerdict(
      three(entry(1), entry(2), entry(3, {}, { totalWithinTolerance: false })),
      key,
    );
    expect(v.attempts).toBe(3);
    expect(v.attemptsPassed).toBe(2);
    expect(v.casePasses).toBe(false);
    expect(v.exploratory).toBe(false);
    expect(
      caseVerdict(three(entry(1), entry(2), entry(3)), key).casePasses,
    ).toBe(true);
  });

  it("2 attempts are exploratory and never pass", () => {
    const v = caseVerdict(three(entry(1), entry(2)), key);
    expect(v.exploratory).toBe(true);
    expect(v.attemptsPassed).toBe(2);
    expect(v.casePasses).toBe(false);
  });

  it("counts 10x attempts separately from recall", () => {
    const v = caseVerdict(
      three(entry(1), entry(2, {}, { storedTotal: 10_000_000 }), entry(3)),
      key,
    );
    expect(v.tenXAttempts).toBe(1);
  });

  it("no expected total means no 10x check", () => {
    const v = caseVerdict(
      three(entry(1, {}, { expectedTotal: null, totalWithinTolerance: null })),
      key,
    );
    expect(v.tenXAttempts).toBe(0);
    expect(v.totalWithinToleranceAll).toBeNull();
  });

  it("counts failed attempts as 0 in recallFailedAsZero", () => {
    const v = caseVerdict(
      three(
        entry(1, {}, { rowRecall: 0.9 }),
        entry(2, {}, { rowRecall: 0.9 }),
        failed(3, "extraction_error"),
      ),
      key,
    );
    expect(v.recallFailedAsZero).toBeCloseTo(0.6);
    expect(v.recallScoredOnly).toBeCloseTo(0.9);
    expect(v.failureModes.scored).toBe(2);
    expect(v.failureModes.extraction_error).toBe(1);
    expect(v.failureModes.ocr_error).toBe(0);
  });

  it("totalWithinToleranceAll needs every attempt scored and within", () => {
    const base = [entry(1), entry(2)];
    expect(
      caseVerdict(three(...base, entry(3)), key).totalWithinToleranceAll,
    ).toBe(true);
    expect(
      caseVerdict(three(...base, failed(3, "zero_rows")), key)
        .totalWithinToleranceAll,
    ).toBe(false);
  });

  it("warning inputs count only wrong-total attempts", () => {
    const wrong = (n: number, warnings: string[]) =>
      entry(n, { warnings }, { totalWithinTolerance: false });
    const v = caseVerdict(
      three(wrong(1, ["a"]), wrong(2, ["b"]), wrong(3, [])),
      key,
    );
    expect(v.wrongTotalAttempts).toBe(3);
    expect(v.warnedWrongTotalAttempts).toBe(2);
    const ok = caseVerdict(three(entry(1, { warnings: ["x"] })), key);
    expect(ok.wrongTotalAttempts).toBe(0);
    expect(ok.warnedWrongTotalAttempts).toBe(0);
  });

  it("recall is null for total-only cases and keys without value rows", () => {
    expect(
      caseVerdict(result([entry(1)], { totalOnly: true }), key)
        .recallFailedAsZero,
    ).toBeNull();
    expect(
      caseVerdict(result([entry(1)]), {
        id: "C-001",
        keyValueRows: 0,
      } as KeyFile).recallScoredOnly,
    ).toBeNull();
  });

  it("sums seconds from stage totals and computes cost", () => {
    const prices = {
      llmInputPerMTok: 1,
      llmOutputPerMTok: 4,
      ocrPerPage: 0.01,
    };
    const r = three(
      entry(1, {
        usage: { calls: 1, promptTokens: 1_000_000, completionTokens: 0 },
      }),
      entry(2),
    );
    const v = caseVerdict(r, key, prices);
    expect(v.seconds).toBe(2);
    expect(v.costUsd).toBeCloseTo(1);
    expect(caseVerdict(r, key).costUsd).toBeNull();
  });
});

describe("setup_error", () => {
  it("is counted as its own failure mode", () => {
    const verdict = caseVerdict(
      result([failed(1, "setup_error"), entry(2), entry(3)]),
      key,
    );
    expect(verdict.failureModes.setup_error).toBe(1);
    expect(verdict.failureModes.extraction_error).toBe(0);
  });
});

describe("blockSummaries", () => {
  const verdictFor = (
    id: string,
    block: Block,
    eligible: boolean | null,
    totalOnly: boolean,
    recall: number,
  ) =>
    caseVerdict(
      result([entry(1, {}, { rowRecall: recall }), entry(2), entry(3)], {
        id,
        block,
        eligible,
        totalOnly,
      }),
      key,
    );

  it("headline recall excludes total-only and non-eligible cases; totals include them", () => {
    const verdicts = [
      verdictFor("A", "validated", true, false, 0.5),
      verdictFor("B", "validated", false, false, 0.1),
      verdictFor("C", "validated", true, true, 0),
      verdictFor("D", "dev", true, false, 1),
    ];
    const manifest = { validated: 5, "held-out": 2, dev: 3 };
    const out = blockSummaries(verdicts, manifest);
    expect(out.map((b) => b.block)).toEqual(["validated", "dev"]);
    const v = out[0];
    expect(v.casesInRun).toBe(3);
    expect(v.casesInManifest).toBe(5);
    // Only case A is eligible with rows: attempts recall (0.5 + 1 + 1) / 3.
    expect(v.headlineRecall).toBeCloseTo((0.5 + 1 + 1) / 3);
    expect(v.casesTotalWithinTolerance).toBe(3);
    expect(v.attemptPassShare).toBe(1);
    expect(v.tenXAttempts).toBe(0);
    expect(v.warningShare).toBeNull();
  });

  it("averages the headline over cases that have a recall and counts them", () => {
    const totalOnlyCase = (id: string) =>
      verdictFor(id, "validated", true, true, 0);
    const verdicts = [
      verdictFor("A", "validated", true, false, 0.6),
      verdictFor("B", "validated", true, false, 1),
      totalOnlyCase("C"),
      totalOnlyCase("D"),
    ];
    const v = blockSummaries(verdicts, {
      validated: 4,
      "held-out": 0,
      dev: 0,
    })[0];
    expect(v.casesInRun).toBe(4);
    expect(v.headlineRecall).toBeCloseTo((0.6 + 1 + 1 + 1 + 1 + 1) / 6);
    expect(v.headlineRecallCases).toBe(2);
    expect(v.recallScoredOnly).not.toBeNull();
    expect(v.recallScoredOnlyCases).toBe(2);
  });

  it("reports a provisional recall over row-scored cases with unknown textTables", () => {
    const unknown = {
      ...verdictFor("A", "validated", false, false, 0.6),
      textTables: null,
    };
    const v = blockSummaries([unknown], {
      validated: 1,
      "held-out": 0,
      dev: 0,
    })[0];
    expect(v.headlineRecall).toBeNull();
    expect(v.provisionalRecall).toBeCloseTo((0.6 + 1 + 1) / 3);
    expect(v.provisionalRecallCases).toBe(1);
  });

  it("counts zero cases when every case is total-only", () => {
    const v = blockSummaries([verdictFor("C", "validated", true, true, 0)], {
      validated: 1,
      "held-out": 0,
      dev: 0,
    })[0];
    expect(v.headlineRecall).toBeNull();
    expect(v.headlineRecallCases).toBe(0);
  });

  it("warning share is warned over wrong-total attempts", () => {
    const wrong = (n: number, warnings: string[]) =>
      entry(n, { warnings }, { totalWithinTolerance: false });
    const v = caseVerdict(
      three(wrong(1, ["a"]), wrong(2, ["b"]), wrong(3, [])),
      key,
    );
    const [summary] = blockSummaries([v], {
      validated: 1,
      "held-out": 0,
      dev: 0,
    });
    expect(summary.warningShare).toBeCloseTo(2 / 3);
    expect(summary.casesTotalWithinTolerance).toBe(0);
  });
});

describe("caseVerdict spec 5.4 metrics", () => {
  const distractor = {
    valueT: 7,
    gpc: "I.1.1",
    what: "d",
    failureMode: "f",
  };

  it("averages precision and accuracies over scored attempts and counts notation keys and distractors", () => {
    const v = caseVerdict(
      three(
        entry(
          1,
          {},
          {
            rowPrecision: 0.5,
            valueAccuracy: 0.6,
            classificationAccuracy: 0.9,
            notationScored: 4,
            notationRecovered: 3,
            distractorsStored: [distractor, distractor],
          },
        ),
        entry(
          2,
          {},
          {
            rowPrecision: 1,
            valueAccuracy: 1,
            classificationAccuracy: 0.7,
            notationScored: 4,
            notationRecovered: 1,
          },
        ),
        failed(3, "zero_rows"),
      ),
      key,
    );
    expect(v.rowPrecision).toBeCloseTo(0.75);
    expect(v.valueAccuracy).toBeCloseTo(0.8);
    expect(v.classificationAccuracy).toBeCloseTo(0.8);
    expect(v.notationScored).toBe(4);
    expect(v.notationRecovered).toBe(3);
    expect(v.distractorsStored).toBeCloseTo(1);
  });

  it("reads the distractor count of a redacted score", () => {
    const redacted = entry(1);
    delete (redacted.score as Partial<FileScore>).distractorsStored;
    (
      redacted.score as unknown as Record<string, number>
    ).distractorsStoredCount = 2;
    expect(caseVerdict(three(redacted), key).distractorsStored).toBe(2);
  });

  it("gives null metrics when no attempt was scored", () => {
    const v = caseVerdict(three(failed(1, "zero_rows")), key);
    expect(v).toMatchObject({
      rowPrecision: null,
      valueAccuracy: null,
      classificationAccuracy: null,
      distractorsStored: null,
      notationScored: 0,
      notationRecovered: 0,
    });
  });
});
