import { useMemo } from "react";
import Fuse from "fuse.js";

interface UseFuzzySearchOptions<T> {
  data: T[];
  keys: string[];
  searchTerm: string;
  threshold?: number;
}

/**
 * Custom hook for fuzzy search functionality using Fuse.js
 * @template T - The type of data items being searched
 * 
 * @example
 * const results = useFuzzySearch({
 *   data: cities,
 *   keys: ['name', 'country'],
 *   searchTerm: 'new york',
 *   threshold: 0.3
 * });
 */
export function useFuzzySearch<T>({
  data,
  keys,
  searchTerm,
  threshold = 0.3,
}: UseFuzzySearchOptions<T>): T[] {
  // Configure Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    if (!data || data.length === 0) return null;
    return new Fuse(data, {
      keys,
      threshold,
      includeScore: true,
    });
  }, [data, keys, threshold]);

  // Filter data based on search term
  const results = useMemo(() => {
    if (!data) return [];
    if (!searchTerm) return data;
    if (!fuse) return data;

    const searchResults = fuse.search(searchTerm);
    return searchResults.map((result) => result.item);
  }, [data, searchTerm, fuse]);

  return results;
}

