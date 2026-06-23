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
  // GPC sub-sector the row belongs to, used to group rows under a heading
  // (e.g. ref "I.1", label "Residential Buildings"). Empty for placeholder rows.
  subsectorRef: string;
  subsectorLabel: string;
  // The row's own label within the sub-sector (the subcategory description).
  subcategoryLabel: string;
  scope: string;
  state: ArtifactRowState;
  value: string | null;
  // Connected data source. sourceName is a short brand/acronym for the chip;
  // sourceFullName + sourceMeta (year · geography) are surfaced on hover.
  sourceName: string | null;
  sourceFullName: string | null;
  sourceMeta: string | null;
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
  // label is the full source name; shortLabel is the brand/acronym shown first.
  label: string;
  shortLabel: string;
  meta: string;
  value: string;
  recommended: boolean;
  // datasource of the connected source behind this option, used to open the
  // shared source-details drawer. Absent for the "leave empty" option.
  datasourceId?: string | null;
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
