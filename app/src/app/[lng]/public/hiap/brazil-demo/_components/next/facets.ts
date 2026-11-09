/**
 * Facet filtering for the proposal sub-pages (risk, finance, policy, legal),
 * on the same rules as the main list's `FilterBar`: within a facet any
 * selected value matches, across facets all must, and each option counts
 * the items it would leave given the other facets.
 */
export interface FacetOption {
  value: string;
  label: string;
}

export interface Facet<T> {
  key: string;
  title: string;
  options: FacetOption[];
  /** Every value an item holds for this facet. */
  values: (item: T) => string[];
  /** How an active filter reads as a chip; defaults to "Title: Option". */
  chip?: (option: FacetOption) => string;
}

export type FacetSelection = Record<string, string[]>;

export function matchesFacets<T>(
  item: T,
  facets: Facet<T>[],
  selected: FacetSelection,
  skip?: string,
): boolean {
  return facets.every((f) => {
    const picked = selected[f.key] ?? [];
    if (f.key === skip || picked.length === 0) return true;
    return f.values(item).some((v) => picked.includes(v));
  });
}

export function facetOptionCount<T>(
  items: T[],
  facets: Facet<T>[],
  selected: FacetSelection,
  facet: Facet<T>,
  value: string,
): number {
  return items.filter(
    (i) =>
      matchesFacets(i, facets, selected, facet.key) &&
      facet.values(i).includes(value),
  ).length;
}

export const selectionIsEmpty = (s: FacetSelection) =>
  Object.values(s).every((v) => v.length === 0);

/** Reads the selection for these keys from a query string. */
export function selectionFromSearch(
  search: string,
  keys: string[],
): FacetSelection {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    keys.map((k) => [k, (params.get(k) ?? "").split(",").filter(Boolean)]),
  );
}

export function selectionToSearch(s: FacetSelection): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(s))
    if (v.length) params.set(k, v.join(","));
  return params.toString();
}
