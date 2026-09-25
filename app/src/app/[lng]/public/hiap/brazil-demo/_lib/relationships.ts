/**
 * Related actions, read in both directions. Relationships are authored once,
 * on the action that depends on (or pairs with) another; the enabling action
 * learns what it unlocks by scanning the bank. Relationships inform planning
 * only — they never enter a score or a rank.
 */
import type { AdaptationAction, Localized } from "./types";
import { ACTION_BY_ID, ADAPTATION_ACTIONS } from "./actions";

export type RelatedRole =
  "requires" | "unlocks" | "corequisite" | "synergistic";

export interface RelatedAction {
  action: AdaptationAction;
  role: RelatedRole;
  rationale: Localized;
}

const ORDER: Record<RelatedRole, number> = {
  requires: 0,
  unlocks: 1,
  corequisite: 2,
  synergistic: 3,
};

export const RELATED_ROLES: RelatedRole[] = [
  "requires",
  "unlocks",
  "corequisite",
  "synergistic",
];

export function relatedActions(action: AdaptationAction): RelatedAction[] {
  const out: RelatedAction[] = [];
  const seen = new Set<string>();
  const push = (
    other: AdaptationAction,
    role: RelatedRole,
    rationale: Localized,
  ) => {
    const key = `${other.id}:${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ action: other, role, rationale });
  };
  for (const rel of action.relationships) {
    const other = ACTION_BY_ID[rel.actionId];
    if (!other) continue;
    push(
      other,
      rel.kind === "prerequisite" ? "requires" : rel.kind,
      rel.rationale,
    );
  }
  for (const other of ADAPTATION_ACTIONS) {
    if (other.id === action.id) continue;
    for (const rel of other.relationships) {
      if (rel.actionId !== action.id) continue;
      push(
        other,
        rel.kind === "prerequisite" ? "unlocks" : rel.kind,
        rel.rationale,
      );
    }
  }
  return out.sort((a, b) => ORDER[a.role] - ORDER[b.role]);
}
