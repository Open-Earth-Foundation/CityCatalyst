"use client";

import { convertKgToTonnes } from "@/util/helpers";
import type {
  DraftDecisionState,
  DraftProposal,
  SourceCandidate,
} from "@/components/StationaryEnergyDraft/types";

const RAW_KG_EMISSIONS_UNITS = new Set(["", "kgco2e", "tco2e"]);

export function extractErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string") {
      return error;
    }

    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") {
        return message;
      }
    }

    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string") {
      return detail;
    }
  }

  return fallback;
}

export async function readJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, fallback));
  }

  return payload as T;
}

export function scopeValue(
  scope: Record<string, string | null | undefined>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = scope[key];
    if (value) {
      return value;
    }
  }

  return null;
}

export function scopeMatches(
  targetRef: Record<string, string | null | undefined>,
  sourceScope: Record<string, string | null | undefined>,
): boolean {
  const targetSector = scopeValue(
    targetRef,
    "sector_id",
    "sector_reference_number",
  );
  const targetSubsector = scopeValue(
    targetRef,
    "subsector_id",
    "subsector_reference_number",
  );
  const targetSubcategory = scopeValue(
    targetRef,
    "subcategory_id",
    "subcategory_reference_number",
  );
  const targetScope = scopeValue(targetRef, "scope_id");

  const sourceSector = scopeValue(
    sourceScope,
    "sector_id",
    "sector_reference_number",
  );
  const sourceSubsector = scopeValue(
    sourceScope,
    "subsector_id",
    "subsector_reference_number",
  );
  const sourceSubcategory = scopeValue(
    sourceScope,
    "subcategory_id",
    "subcategory_reference_number",
  );
  const sourceScopeId = scopeValue(sourceScope, "scope_id");

  if (targetSector && sourceSector && targetSector !== sourceSector) {
    return false;
  }
  if (
    targetSubsector &&
    (!sourceSubsector || targetSubsector !== sourceSubsector)
  ) {
    return false;
  }
  if (
    targetSubcategory &&
    (!sourceSubcategory || targetSubcategory !== sourceSubcategory)
  ) {
    return false;
  }
  if (targetScope && (!sourceScopeId || targetScope !== sourceScopeId)) {
    return false;
  }

  return true;
}

export function proposalLabel(proposal: DraftProposal): string {
  const subsector =
    proposal.target_ref.subsector_name ??
    proposal.target_ref.subsector_reference_number ??
    proposal.target_ref.subsector_id;
  const subcategory =
    proposal.target_ref.subcategory_name ??
    proposal.target_ref.subcategory_reference_number ??
    proposal.target_ref.subcategory_id;
  const scope = proposal.target_ref.scope_name ?? proposal.target_ref.scope_id;

  return [subsector, subcategory, scope].filter(Boolean).join(" / ");
}

function parseEmissionsKgValue(value: unknown): bigint | number | null {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  if (/^-?\d+$/.test(text)) {
    try {
      return BigInt(text);
    } catch {
      return null;
    }
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeEmissionsUnitLabel(unit: unknown): string | null {
  const text = String(unit ?? "").trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, "").toLowerCase();
  if (normalized === "kgco2e") {
    return "kg CO2e";
  }
  if (normalized === "tco2e") {
    return "t CO2e";
  }
  if (normalized === "ktco2e") {
    return "kt CO2e";
  }
  if (normalized === "mtco2e") {
    return "Mt CO2e";
  }
  if (normalized === "gtco2e") {
    return "Gt CO2e";
  }

  return text;
}

export function formatDraftEmissionsLabel(
  value: unknown,
  unit: unknown,
): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const normalizedUnit = String(unit ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (RAW_KG_EMISSIONS_UNITS.has(normalizedUnit)) {
    const kgValue = parseEmissionsKgValue(value);
    return kgValue == null ? text : convertKgToTonnes(kgValue, null);
  }

  const displayUnit = normalizeEmissionsUnitLabel(unit);
  return [text, displayUnit].filter(Boolean).join(" ");
}

export function sourceGeographyLabel(
  geographyMatch: string | null | undefined,
): string | null {
  const text = String(geographyMatch ?? "")
    .trim()
    .toLowerCase();
  if (!text || text === "unknown" || text === "global") {
    return null;
  }
  if (text === "locode") {
    return "city";
  }
  return text;
}

export function currentValueLabel(proposal: DraftProposal): string {
  if (!proposal.current_value) {
    return "No current inventory value";
  }

  const value = proposal.current_value["value"];
  const unit = proposal.current_value["unit"];
  const emissionsValue = proposal.current_value["emissions_value"];
  const emissionsUnit = proposal.current_value["emissions_unit"];
  const emissionsLabel = formatDraftEmissionsLabel(
    emissionsValue,
    emissionsUnit,
  );

  return [value, unit, emissionsLabel ? `(${emissionsLabel})` : null]
    .filter(Boolean)
    .join(" ");
}

export function proposedValueLabel(proposal: DraftProposal): string {
  if (!proposal.proposed_value) {
    return "No source-backed draft value";
  }

  const value = proposal.proposed_value["value"];
  const unit = proposal.proposed_value["unit"];
  const emissionsValue = proposal.proposed_value["emissions_value"];
  const emissionsUnit = proposal.proposed_value["emissions_unit"];
  const emissionsLabel = formatDraftEmissionsLabel(
    emissionsValue,
    emissionsUnit,
  );

  return [value, unit, emissionsLabel ? `(${emissionsLabel})` : null]
    .filter(Boolean)
    .join(" ");
}

export function sourceLabel(candidate: SourceCandidate | undefined): string {
  if (!candidate) {
    return "No source selected";
  }

  return [
    candidate.name ?? candidate.datasource_id,
    candidate.dataset_year ? String(candidate.dataset_year) : null,
    sourceGeographyLabel(candidate.geography_match),
  ]
    .filter(Boolean)
    .join(" / ");
}

export function findRecommendedSource(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
): SourceCandidate | undefined {
  return candidates.find(
    (candidate) =>
      candidate.candidate_id === proposal.recommended_candidate_id ||
      candidate.datasource_id === proposal.recommended_datasource_id,
  );
}

export function compatibleSources(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
): SourceCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.applicability_status === "applicable" &&
      scopeMatches(proposal.target_ref, candidate.source_scope),
  );
}

export function initialDecisionForProposal(
  proposal: DraftProposal,
  candidates: SourceCandidate[],
): DraftDecisionState {
  const matchingCandidates = compatibleSources(proposal, candidates);
  const selectedSource =
    findRecommendedSource(proposal, candidates) ?? matchingCandidates[0];

  return {
    action: proposal.recommended_candidate_id ? "accept" : "leave_draft",
    selectedSourceId:
      selectedSource?.candidate_id ?? selectedSource?.datasource_id ?? "",
    manualValue: "",
    manualUnit: "",
    note: "",
  };
}

export function statusTone(
  status: string,
): "green" | "orange" | "red" | "blue" {
  if (["ready", "accepted", "committed", "saved"].includes(status)) {
    return "green";
  }
  if (
    ["conflict", "needs_review", "reviewed", "partially_saved"].includes(status)
  ) {
    return "orange";
  }
  if (["gap", "failed"].includes(status)) {
    return "red";
  }
  return "blue";
}
