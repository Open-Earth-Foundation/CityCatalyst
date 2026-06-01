type ScopeLike = Record<string, unknown> | null | undefined;

const SCOPE_KEY_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["sector_id", "sector_reference_number"],
  ["subsector_id", "subsector_reference_number"],
  ["subcategory_id", "subcategory_reference_number"],
  ["scope_id"],
];

export function stationaryEnergyScopeIdentity(
  scope: ScopeLike,
): Array<string | null> {
  if (!scope) {
    return SCOPE_KEY_GROUPS.map(() => null);
  }

  return SCOPE_KEY_GROUPS.map((keys) => firstNonEmpty(scope, ...keys));
}

export function stationaryEnergyScopeMatchesTarget(
  targetRef: ScopeLike,
  sourceScope: ScopeLike,
): boolean {
  if (!targetRef || !sourceScope) {
    return false;
  }

  const [targetSector, targetSubsector, targetSubcategory, targetScope] =
    stationaryEnergyScopeIdentity(targetRef);
  const [sourceSector, sourceSubsector, sourceSubcategory, sourceScopeId] =
    stationaryEnergyScopeIdentity(sourceScope);

  if (targetSector && sourceSector && targetSector !== sourceSector) {
    return false;
  }

  if (targetSubsector && (!sourceSubsector || targetSubsector !== sourceSubsector)) {
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

  return [targetSector, targetSubsector, targetSubcategory, targetScope].some(
    (value) => value != null,
  );
}

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
