/** Public contracts shared by the point workspace UI and Clima's scoped API. */
export type DocumentPointValue =
  | string
  | number
  | boolean
  | null
  | DocumentPointValue[]
  | { [key: string]: DocumentPointValue };

export interface DocumentPointCitation {
  source_label: string;
  quote: string;
  page_number: number | null;
  source_anchor: string | null;
}

export interface DocumentPointCandidate {
  candidate_id: string;
  value: DocumentPointValue;
  citations: DocumentPointCitation[];
  status: "pending" | "accepted" | "dismissed";
}

export interface DocumentPointTask {
  status: "active" | "parked" | "waiting" | "done";
  waiting_for: string | null;
  requested_information: string | null;
  note: string | null;
}

export interface DocumentWorkspacePoint {
  point_id: string;
  key: string;
  label: string;
  description: string;
  kind: "fact" | "decision";
  answer_type: "text" | "number" | "date" | "choice" | "multiline";
  /** Trusted template choices. Model suggestions cannot expand this set. */
  choices?: string[];
  required: boolean;
  allow_assumption: boolean;
  allow_not_applicable: boolean;
  version: number;
  status:
    | "missing"
    | "needs_confirmation"
    | "conflict"
    | "answered"
    | "assumption"
    | "not_applicable";
  value: DocumentPointValue;
  chapter_refs: string[];
  candidates: DocumentPointCandidate[];
  task: DocumentPointTask | null;
  freshness:
    "missing" | "current" | "stale" | "updating" | "pending_review" | "failed";
}

export interface DocumentWorkspaceNeed {
  need_id: string;
  key: string;
  label: string;
  description: string;
  required: boolean;
  status: "available" | "missing" | "later" | "waiting" | "unavailable";
  point_keys: string[];
  guidance: string;
  documents: {
    upload_id: string;
    source_label: string;
    filename: string;
    source_format: "pdf" | "markdown";
    ready: boolean;
  }[];
}

export interface DocumentWorkspace {
  revision: number;
  setup: {
    name: string;
    document_type: string;
    version: number;
    fingerprint: string;
    ready: boolean;
  } | null;
  points: DocumentWorkspacePoint[];
  needs: DocumentWorkspaceNeed[];
  overview: {
    required_total: number;
    required_covered: number;
    optional_total: number;
    optional_covered: number;
    waiting_count: number;
    next_steps: { point_id: string; label: string; reason: string }[];
  };
  export_eligibility: {
    working: boolean;
    final: boolean;
    blockers: string[];
    workspace_revision: number;
  };
}

export interface DocumentPointCommand {
  command:
    | "answer"
    | "confirm_candidate"
    | "correct"
    | "park"
    | "resume"
    | "assume"
    | "not_applicable"
    | "dismiss_candidate";
  expected_version: number;
  idempotency_key: string;
  value?: DocumentPointValue;
  candidate_id?: string;
  reason?: string;
  waiting_for?: string;
  requested_information?: string;
  note?: string;
}

export interface DocumentPointCommandResult {
  point: DocumentWorkspacePoint;
  workspace_revision: number;
  update_job: { job_id: string; status: string } | null;
}

export interface DocumentPointQuestion {
  pattern:
    | "confirm"
    | "evidence"
    | "quick_pick"
    | "short_form"
    | "compare"
    | "decision";
  why_asking: string;
  questions: { question: string; options: string[] }[];
}
