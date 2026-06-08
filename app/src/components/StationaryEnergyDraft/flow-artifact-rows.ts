import type {
  ArtifactRow,
  ArtifactRowState,
} from "@/components/StationaryEnergyDraft/flow-types";
import type {
  DraftProposal,
  DraftStatusResponse,
  SourceCandidate,
} from "@/components/StationaryEnergyDraft/types";
import {
  currentValueLabel,
  findRecommendedSource,
  proposalLabel,
  proposedValueLabel,
  sourceLabel,
} from "@/components/StationaryEnergyDraft/utils";
import type { TFunction } from "i18next";

const START_ROW_DEFINITIONS = [
  {
    labelKey: "artifact-start-row-residential",
    scopeKey: "artifact-start-row-scope-12",
  },
  {
    labelKey: "artifact-start-row-commercial",
    scopeKey: "artifact-start-row-scope-12",
  },
  {
    labelKey: "artifact-start-row-manufacturing",
    scopeKey: "artifact-start-row-scope-12",
  },
  {
    labelKey: "artifact-start-row-energy-industries",
    scopeKey: "artifact-start-row-scope-12",
  },
  {
    labelKey: "artifact-start-row-agriculture",
    scopeKey: "artifact-start-row-scope-1",
  },
  {
    labelKey: "artifact-start-row-non-specified",
    scopeKey: "artifact-start-row-scope-1",
  },
  {
    labelKey: "artifact-start-row-fugitive-mining",
    scopeKey: "artifact-start-row-scope-1",
  },
  {
    labelKey: "artifact-start-row-fugitive-oil-gas",
    scopeKey: "artifact-start-row-scope-1",
  },
] as const;

const ARTIFACT_FALLBACKS = {
  "artifact-start-row-residential": "I.1 Residential buildings",
  "artifact-start-row-commercial": "I.2 Commercial & institutional",
  "artifact-start-row-manufacturing": "I.3 Manufacturing & construction",
  "artifact-start-row-energy-industries": "I.4 Energy industries",
  "artifact-start-row-agriculture": "I.5 Agriculture, forestry & fishing",
  "artifact-start-row-non-specified": "I.6 Non-specified sources",
  "artifact-start-row-fugitive-mining": "I.7 Fugitive - mining & coal",
  "artifact-start-row-fugitive-oil-gas": "I.8 Fugitive - oil & natural gas",
  "artifact-start-row-scope-12": "Scope 1 / 2",
  "artifact-start-row-scope-1": "Scope 1",
  "artifact-row-fallback": "Stationary Energy row",
  "artifact-status-needs-choice": "needs your choice",
  "artifact-status-no-source": "no source",
  "artifact-status-left-draft": "left as draft",
  "artifact-status-queued": "queued",
  "artifact-status-drafted": "drafted",
  "artifact-status-no-current-value": "No current inventory value",
} as const;

export function buildArtifactRows(
  draftState: DraftStatusResponse | null,
  t?: TFunction,
): ArtifactRow[] {
  if (!draftState) {
    return buildStartRows(t);
  }
  if (draftState.status === "failed" && draftState.proposals.length === 0) {
    return buildStartRows(t);
  }

  return draftState.proposals.map((proposal) => {
    const recommendedSource = findRecommendedSource(
      proposal,
      draftState.source_candidates,
    );
    return {
      id: proposal.proposal_id,
      label:
        proposalLabel(proposal) ||
        translateArtifactText(t, "artifact-row-fallback"),
      scope: rowScopeLabel(proposal),
      state: artifactStateForProposal(proposal),
      value: proposal.proposed_value ? proposedValueLabel(proposal) : null,
      source: recommendedSource ? sourceLabel(recommendedSource) : null,
      status: artifactStatusLabel(proposal, t),
    };
  });
}

function buildStartRows(t?: TFunction): ArtifactRow[] {
  return START_ROW_DEFINITIONS.map(({ labelKey, scopeKey }, index) => ({
    id: `placeholder-${index}`,
    label: translateArtifactText(t, labelKey),
    scope: translateArtifactText(t, scopeKey),
    state: "queued",
    value: null,
    source: null,
    status: translateArtifactText(t, "artifact-status-queued"),
  }));
}

function translateArtifactText(
  t: TFunction | undefined,
  key: keyof typeof ARTIFACT_FALLBACKS,
): string {
  return t?.(key) ?? ARTIFACT_FALLBACKS[key];
}

function artifactStateForProposal(proposal: DraftProposal): ArtifactRowState {
  if (proposal.status === "conflict" || proposal.status === "needs_review") {
    return "warning";
  }
  if (proposal.status === "gap" || proposal.status === "left_draft") {
    return "empty";
  }
  if (proposal.status === "draft") {
    return "queued";
  }
  if (proposal.proposed_value || proposal.recommended_candidate_id) {
    return "done";
  }
  if (proposal.current_value) {
    return "manual";
  }
  return "empty";
}

function artifactStatusLabel(proposal: DraftProposal, t?: TFunction): string {
  if (proposal.status === "conflict" || proposal.status === "needs_review") {
    return translateArtifactText(t, "artifact-status-needs-choice");
  }
  if (proposal.status === "gap") {
    return translateArtifactText(t, "artifact-status-no-source");
  }
  if (proposal.status === "left_draft") {
    return translateArtifactText(t, "artifact-status-left-draft");
  }
  if (proposal.status === "draft") {
    return translateArtifactText(t, "artifact-status-queued");
  }
  if (proposal.proposed_value || proposal.recommended_candidate_id) {
    return translateArtifactText(t, "artifact-status-drafted");
  }
  if (!proposal.current_value) {
    return translateArtifactText(t, "artifact-status-no-current-value");
  }
  return currentValueLabel(proposal);
}

function rowScopeLabel(proposal: DraftProposal): string {
  return [
    proposal.target_ref.scope_name ?? proposal.target_ref.scope_id,
    proposal.target_ref.subcategory_reference_number,
  ]
    .filter(Boolean)
    .join(" / ");
}
