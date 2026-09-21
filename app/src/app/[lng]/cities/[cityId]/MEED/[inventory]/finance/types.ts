/**
 * Local view of the Global API climate-finance responses.
 *
 * (`useGetMeedFinanceFeasibilityQuery` / `useGetMeedFinanceLinkQuery` are typed
 * `unknown` in the service layer — these shapes mirror the MEED+ prototype.)
 */

export interface FeasibilityInputs {
  action?: { capital_intensity?: number; preparation_complexity?: number };
  city?: { profile?: string | null };
  finance?: { fund_access?: string; n_reachable_opportunities?: number };
  evidence?: { n_existing_projects?: number };
}

export interface FeasibilityRow {
  action_id: string;
  action_name?: string;
  sector?: string | null;
  financial_feasibility: number;
  route?: string | null;
  reason?: string | null;
  inputs?: FeasibilityInputs | null;
  links?: { detail?: string; opportunities?: string; projects?: string } | null;
}

export interface Opportunity {
  opportunity_name?: string;
  funder_name?: string;
  instrument?: string;
  status?: string;
  source_url?: string;
  amount_note?: string | null;
  notes?: string;
}

export interface FundingSource {
  cycle?: string | number;
  funder_name?: string;
}

export interface Project {
  project_name?: string;
  project_name_i18n?: { en?: string; es?: string };
  sector?: string;
  jurisdiction?: string;
  lifecycle_stage?: string;
  funding_channel?: string;
  cost_total?: number | null;
  /** Scale of `cost_total`, e.g. "CLP_thousands". */
  amount_unit?: string | null;
  funding_sources?: FundingSource[];
  action_matches?: { action_id: string; confidence?: string }[];
}

export function extractFeasibilityRows(data: unknown): FeasibilityRow[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data &&
        typeof data === "object" &&
        Array.isArray((data as { data?: unknown[] }).data)
      ? (data as { data: unknown[] }).data
      : [];
  return list.filter(
    (r): r is FeasibilityRow =>
      !!r &&
      typeof r === "object" &&
      typeof (r as FeasibilityRow).action_id === "string" &&
      typeof (r as FeasibilityRow).financial_feasibility === "number",
  );
}

export function extractLinkedList<T>(data: unknown): {
  rows: T[];
  total: number;
} {
  if (!data || typeof data !== "object") return { rows: [], total: 0 };
  const env = data as {
    data?: unknown;
    meta?: { total?: number; count?: number };
  };
  const rows = Array.isArray(env.data) ? (env.data as T[]) : [];
  // Projects report `meta.total`; opportunities only report `meta.count`.
  const total =
    typeof env.meta?.total === "number"
      ? env.meta.total
      : typeof env.meta?.count === "number"
        ? env.meta.count
        : rows.length;
  return { rows, total };
}
