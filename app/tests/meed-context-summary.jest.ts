import type { TFunction } from "i18next";
import {
  contextSummary,
  MEED_CONTEXT_AREAS,
  type MeedContextFacts,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/contextAreas";
import type { MeedSectionStates } from "@/app/[lng]/cities/[cityId]/MEED/meedStatus";

// Echo the key and its interpolation values so assertions can check both.
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key) as unknown as TFunction;

const regulations = MEED_CONTEXT_AREAS.find((a) => a.key === "regulations")!;

const base: MeedContextFacts = {
  rankedCount: 20,
  excludedCount: 0,
  strongPolicyBacking: 0,
  states: {} as MeedSectionStates,
};

const legalCounts = { blocked: 0, conditional: 6, enabled: 8, not_assessed: 6 };

describe("contextSummary — regulations line", () => {
  it("says nothing is removed when standings exist and nothing was excluded", () => {
    const line = contextSummary(regulations, { ...base, legalCounts }, t);
    expect(line).toBe("context-summary-legal");
  });

  it("reports the removed count when the backend still excluded actions", () => {
    const line = contextSummary(
      regulations,
      { ...base, legalCounts, excludedCount: 19 },
      t,
    );
    expect(line).toContain("context-summary-legal-removed");
    expect(line).toContain('"excluded":19');
  });

  it("falls back to the funnel when there are no standings", () => {
    const line = contextSummary(
      regulations,
      { ...base, legalFunnel: { assessed: 10, passed: 7, ranked: 7 } },
      t,
    );
    expect(line).toContain("context-summary-legal-removed");
    expect(line).toContain('"excluded":3');
  });

  it("says the area runs with the ranking before one exists", () => {
    const line = contextSummary(regulations, { ...base, hasRanking: false }, t);
    expect(line).toBe("context-summary-runs-with-ranking");
  });
});
