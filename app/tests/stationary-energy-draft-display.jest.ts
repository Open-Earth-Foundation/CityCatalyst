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
