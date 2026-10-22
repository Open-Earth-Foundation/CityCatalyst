import { expect, it } from "@jest/globals";
import {
  buildArtifactRows,
  buildDecisionReviewContext,
  buildSourcePreferenceOptions,
} from "@/components/StationaryEnergyDraft/flow";
import {
  draftRunStatusLabel,
  formatDraftRunUpdatedAt,
} from "@/components/StationaryEnergyDraft/stationary-energy-drafts-panel-format";
import { proposalLabel } from "@/components/StationaryEnergyDraft/utils";
import gpcReferenceTable from "@/util/GHGI/data/gpc-reference-table.json";
import { nameToI18NKey } from "@/util/helpers";
import esData from "@/i18n/locales/es/data.json";
import enAgentic from "@/i18n/locales/en/stationary-energy-agentic.json";
import esAgentic from "@/i18n/locales/es/stationary-energy-agentic.json";
import { draftFixture } from "./fixtures/stationary-energy-draft";

describe("stationary energy draft display", () => {
  it("resolves draft list status labels through translation keys", () => {
    const t = ((key: string) => key) as Parameters<
      typeof draftRunStatusLabel
    >[0];

    expect(draftRunStatusLabel(t, "resolving_scope")).toBe(
      "artifact-draft-status-resolving-scope",
    );
    expect(draftRunStatusLabel(t, "loading_context")).toBe(
      "artifact-draft-status-loading-context",
    );
    expect(draftRunStatusLabel(t, "partially_saved")).toBe(
      "artifact-draft-status-partially-saved",
    );
    expect(draftRunStatusLabel(t, "future_backend_status")).toBe(
      "artifact-draft-status-unknown",
    );
  });

  it("formats draft list timestamps with the active route locale", () => {
    const value = "2026-02-03T04:05:00.000Z";
    const expected = new Intl.DateTimeFormat("fr", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));

    const t = ((key: string) => key) as Parameters<
      typeof formatDraftRunUpdatedAt
    >[0];

    expect(formatDraftRunUpdatedAt(t, value, "fr")).toBe(expected);
    expect(formatDraftRunUpdatedAt(t, "invalid timestamp", "fr")).toBe(
      "drafts-panel-updated-at-unavailable",
    );
  });

  it("translates GPC names and scope in proposal labels", () => {
    const es = esData as Record<string, string>;
    const t = ((key: string, options?: { defaultValue?: string }) =>
      es[key] ?? options?.defaultValue ?? key) as Parameters<
      typeof proposalLabel
    >[1];
    const proposal = draftFixture().proposals[0];
    proposal.target_ref = {
      ...proposal.target_ref,
      subsector_name: "Residential Buildings",
      subcategory_name:
        "Emissions From Fuel Combustion Within The City Boundary",
      scope_name: "Scope 1",
    };

    expect(proposalLabel(proposal, t)).toBe(
      `${es["residential-buildings"]} / ${es["emissions-from-fuel-combustion-within-the-city-boundary"]} / ${es.scope} 1`,
    );
    expect(proposalLabel(proposal)).toBe(
      "Residential Buildings / Emissions From Fuel Combustion Within The City Boundary / Scope 1",
    );
  });

  it("has data translations for every stationary energy GPC name", () => {
    const es = esData as Record<string, string>;
    // Mirrors the backend friendlyLabel() formatting of target_ref names.
    const missing = (
      gpcReferenceTable as {
        sector: string;
        subsector: string;
        subcategoryName: string;
      }[]
    )
      .filter((row) => row.sector === "stationary-energy")
      .flatMap((row) => [row.subsector, row.subcategoryName])
      .map((name) => nameToI18NKey(name.replace(/[-_]+/g, " ")))
      .filter((key) => !es[key]);

    expect(missing).toEqual([]);
  });

  it("has no English leftovers in the Spanish stationary energy copy", () => {
    // Values that read the same in both languages.
    const sameInBoth = new Set(["Sector", "Clima", "Manual"]);
    const es = esAgentic as Record<string, string>;
    const untranslated = Object.entries(enAgentic)
      .filter(([key, value]) => es[key] === value && !sameInBoth.has(value))
      .map(([key]) => key);

    expect(untranslated).toEqual([]);
  });

  it("maps proposals into artifact row states", () => {
    const rows = buildArtifactRows(draftFixture());

    expect(rows.find((row) => row.id === "proposal-ready")?.state).toBe("done");
    expect(rows.find((row) => row.id === "proposal-conflict")?.state).toBe(
      "warning",
    );
    expect(rows.find((row) => row.id === "proposal-gap")?.state).toBe("empty");
  });

  it("derives source preference chips from real dataset names", () => {
    expect(
      buildSourcePreferenceOptions(draftFixture().source_candidates),
    ).toEqual([
      "Grid dataset",
      "Scope comparison dataset",
      "Building benchmark dataset",
    ]);
  });

  it("formats raw draft emissions from kg and hides misleading global metadata", () => {
    const draft = draftFixture();
    draft.source_candidates[0] = {
      ...draft.source_candidates[0],
      dataset_year: 2024,
      geography_match: "global",
      normalized_rows: [
        { emissions_value: "6821641830", emissions_unit: "tCO2e" },
      ],
    };
    draft.proposals[1] = {
      ...draft.proposals[1],
      recommended_candidate_id: "candidate-1",
      recommended_datasource_id: "source-1",
      proposed_value: {
        emissions_value: "6821641830",
        emissions_unit: "tCO2e",
      },
    };

    const rows = buildArtifactRows(draft);
    const context = buildDecisionReviewContext({
      draftState: draft,
      resolvedProposalIds: new Set(),
    });

    expect(rows.find((row) => row.id === "proposal-conflict")?.value).toBe(
      "6.82 MtCO₂e",
    );
    expect(rows.find((row) => row.id === "proposal-conflict")?.sourceName).toBe(
      "SEEG",
    );
    expect(rows.find((row) => row.id === "proposal-conflict")?.sourceMeta).toBe(
      "2024",
    );
    expect(context[1]).toEqual(
      expect.objectContaining({
        recommendedOption: expect.objectContaining({
          meta: "2024",
          value: "6.82 MtCO₂e",
        }),
      }),
    );
  });
});
