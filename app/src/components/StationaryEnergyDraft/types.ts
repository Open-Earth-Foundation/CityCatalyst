"use client";

export type DraftProposal = {
  proposal_id: string;
  target_ref: Record<string, string | null | undefined>;
  current_value?: Record<string, unknown> | null;
  recommended_candidate_id?: string | null;
  recommended_datasource_id?: string | null;
  alternative_candidate_ids: string[];
  proposed_value?: Record<string, unknown> | null;
  rationale?: string | null;
  status: string;
  confidence_score?: string | number | null;
};

export type SourceCandidate = {
  candidate_id?: string | null;
  datasource_id: string;
  name?: string | null;
  publisher_name?: string | null;
  dataset_name?: string | null;
  dataset_year?: string | number | null;
  details_datasource_id?: string | null;
  geography_match?: string | null;
  applicability_status: string;
  applicability_issues?: string[];
  failure_reason?: string | null;
  source_scope: Record<string, string | null | undefined>;
  normalized_rows?: Array<Record<string, unknown>>;
};

export type ReviewDecision = {
  proposal_id: string;
  action: string;
  selected_source_id?: string | null;
  selected_candidate_id?: string | null;
  manual_value?: string | number | null;
  manual_unit?: string | null;
  commit_status?: string;
  note?: string | null;
  decision_version?: number;
};

export type StagedReviewSelection = {
  selection_id: string;
  draft_run_id: string;
  proposal_id: string;
  user_id: string;
  action: string;
  selected_source_id?: string | null;
  selected_candidate_id?: string | null;
  rationale?: string | null;
  tool_call_id?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DraftStaleness = {
  is_stale: boolean;
  reason?: string | null;
  stored_source_ids: string[];
  current_source_ids: string[];
};

export type DraftStatusResponse = {
  draft_run_id: string;
  thread_id?: string | null;
  status: string;
  workflow_step?: string | null;
  proposals: DraftProposal[];
  source_candidates: SourceCandidate[];
  review_decisions: ReviewDecision[];
  staged_review_selections?: StagedReviewSelection[];
  error_summary?: Record<string, unknown> | null;
  staleness?: DraftStaleness | null;
};

export type DraftListItem = {
  draft_run_id: string;
  thread_id?: string | null;
  status: string;
  workflow_step?: string | null;
  reviewable_proposal_count: number;
  resolved_review_count: number;
  staged_commit_count: number;
  created_at: string;
  updated_at: string;
};

export type DraftListResponse = {
  drafts: DraftListItem[];
};

export type ReviewResponse = {
  draft_run_id: string;
  status: string;
  decisions: ReviewDecision[];
};

export type SaveResponse = {
  draft_run_id: string;
  status: string;
  decisions: ReviewDecision[];
};

export type DraftDecisionAction =
  | "accept"
  | "override_source"
  | "override_manual"
  | "leave_draft";

export type DraftDecisionState = {
  action: DraftDecisionAction;
  selectedSourceId: string;
  manualValue: string;
  manualUnit: string;
  note: string;
};
