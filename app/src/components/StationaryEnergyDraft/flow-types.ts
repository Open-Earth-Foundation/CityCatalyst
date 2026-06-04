import type {
  DraftDecisionState,
  DraftProposal,
} from "@/components/StationaryEnergyDraft/types";

export type ArtifactRowState =
  | "queued"
  | "active"
  | "done"
  | "manual"
  | "warning"
  | "empty";
export type DraftStage = "start" | "drafting" | "decision" | "review";

export type ArtifactRow = {
  id: string;
  label: string;
  scope: string;
  state: ArtifactRowState;
  value: string | null;
  source: string | null;
  status: string;
};

export type DraftCounts = {
  total: number;
  ready: number;
  conflict: number;
  gap: number;
  needsReview: number;
  accepted: number;
  committed: number;
};

export type DecisionOption = {
  id: string;
  action: DraftDecisionState["action"];
  label: string;
  meta: string;
  value: string;
  recommended: boolean;
};

type BaseDecisionReviewContext = {
  proposal_id: string;
  proposal: DraftProposal;
  label: string;
  status: string;
  recommendedOption: DecisionOption | null;
  alternativeOptions: DecisionOption[];
  leaveDraftOption: DecisionOption;
};

export type SingleSourceDecisionReviewContext = BaseDecisionReviewContext & {
  kind: "single_source";
  recommendedOption: DecisionOption;
};

export type MultiSourceDecisionReviewContext = BaseDecisionReviewContext & {
  kind: "multi_source";
};

export type DecisionReviewContext =
  | SingleSourceDecisionReviewContext
  | MultiSourceDecisionReviewContext;

export const REVIEWED_STATUSES = new Set([
  "reviewed",
  "saved",
  "partially_saved",
  "no_changes",
]);

export const TERMINAL_DRAFT_STATUSES = new Set([
  "saved",
  "partially_saved",
  "no_changes",
  "failed",
]);

export const START_ROWS: ArtifactRow[] = [
  ["I.1 Residential buildings", "Scope 1 / 2"],
  ["I.2 Commercial & institutional", "Scope 1 / 2"],
  ["I.3 Manufacturing & construction", "Scope 1 / 2"],
  ["I.4 Energy industries", "Scope 1 / 2"],
  ["I.5 Agriculture, forestry & fishing", "Scope 1"],
  ["I.6 Non-specified sources", "Scope 1"],
  ["I.7 Fugitive - mining & coal", "Scope 1"],
  ["I.8 Fugitive - oil & natural gas", "Scope 1"],
].map(([label, scope], index) => ({
  id: `placeholder-${index}`,
  label,
  scope,
  state: "queued",
  value: null,
  source: null,
  status: "queued",
}));
