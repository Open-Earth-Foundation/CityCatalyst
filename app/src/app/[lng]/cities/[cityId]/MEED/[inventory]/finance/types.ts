/**
 * Local view of the hiap-meed climate-finance responses (see
 * `MeedReferenceFinance*` in `@/util/types/meed`), loosened so the cards
 * tolerate missing fields.
 */
import type {
  MeedReferenceFinanceOpportunity,
  MeedReferenceFinanceProject,
} from "@/util/types/meed";

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
}

export type Opportunity = Partial<MeedReferenceFinanceOpportunity> & {
  amount_note?: string | null;
  notes?: string | null;
};

export type FundingSource = Partial<
  MeedReferenceFinanceProject["funding_sources"][number]
>;

export type Project = Partial<MeedReferenceFinanceProject> & {
  project_name_i18n?: { en?: string; es?: string } | null;
};

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
