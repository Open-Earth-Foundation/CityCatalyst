type ScopeLike = Record<string, unknown> | null | undefined;

type StationaryEnergyScopeIdentity = {
  sector: string | null;
  subsector: string | null;
  subcategory: string | null;
  scopeId: string | null;
};

const SCOPE_KEYS = {
  sector: ["sector_id", "sector_reference_number"],
  subsector: ["subsector_id", "subsector_reference_number"],
  subcategory: ["subcategory_id", "subcategory_reference_number"],
  scopeId: ["scope_id"],
} as const;

/**
 * Read the stable identity fields used to match Stationary Energy scopes.
 */
export function stationaryEnergyScopeIdentity(
  scope: ScopeLike,
): StationaryEnergyScopeIdentity | null {
  if (!scope) {
    return null;
  }

  return {
    sector: firstNonEmpty(scope, ...SCOPE_KEYS.sector),
    subsector: firstNonEmpty(scope, ...SCOPE_KEYS.subsector),
    subcategory: firstNonEmpty(scope, ...SCOPE_KEYS.subcategory),
    scopeId: firstNonEmpty(scope, ...SCOPE_KEYS.scopeId),
  };
}

/**
 * Check whether a source scope satisfies the accepted target reference.
 */
export function stationaryEnergyScopeMatchesTarget(
  targetRef: ScopeLike,
  sourceScope: ScopeLike,
): boolean {
  const targetIdentity = stationaryEnergyScopeIdentity(targetRef);
  const sourceIdentity = stationaryEnergyScopeIdentity(sourceScope);

  if (!targetIdentity || !sourceIdentity) {
    return false;
  }

  if (
    targetIdentity.sector &&
    sourceIdentity.sector &&
    targetIdentity.sector !== sourceIdentity.sector
  ) {
    return false;
  }

  if (
    targetIdentity.subsector &&
    (!sourceIdentity.subsector ||
      targetIdentity.subsector !== sourceIdentity.subsector)
  ) {
    return false;
  }

  if (
    targetIdentity.subcategory &&
    (!sourceIdentity.subcategory ||
      targetIdentity.subcategory !== sourceIdentity.subcategory)
  ) {
    return false;
  }

  if (
    targetIdentity.scopeId &&
    (!sourceIdentity.scopeId ||
      targetIdentity.scopeId !== sourceIdentity.scopeId)
  ) {
    return false;
  }

  return Object.values(targetIdentity).some((value) => value != null);
}

/**
 * Return the first non-empty string value for the given scope keys.
 */
function firstNonEmpty(scope: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = scope[key];
    if (value == null) {
      continue;
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return null;
}
