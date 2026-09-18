// use with filter to exclude null-ish values from the type as well as contents of an array
// for example `const cleanList = list.filter(notEmpty);`
export function notEmpty<TValue>(
  value: TValue | null | undefined,
): value is TValue {
  return value !== null && value !== undefined;
}

// returns a new array keeping only the first item for each key produced by `getKey`
// for example `const uniqueOrgs = uniqueBy(organizations, (org) => org.organizationId);`
export function uniqueBy<TValue, TKey>(
  items: TValue[],
  getKey: (item: TValue) => TKey,
): TValue[] {
  const seenKeys = new Set<TKey>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}
