"use client";
/**
 * Demo-local city inputs, kept in the browser per city and track.
 *
 * Nothing here reaches a server. Reviewers can change preferences, exclude
 * actions and "run" the ranking, and the screens react — which is the point
 * of a clickable demo — but reloading in another browser starts clean.
 */
import { useCallback, useSyncExternalStore } from "react";
import type {
  DemoPreferences,
  DemoTrack,
  DemoTrackState,
  DemoWeights,
} from "./types";

export const DEFAULT_WEIGHTS: DemoWeights = {
  impact: 55,
  alignment: 22,
  feasibility: 23,
};

export const EMPTY_PREFERENCES: DemoPreferences = {
  sectors: [],
  coBenefits: [],
  timeline: [],
  priorityRisks: [],
  excludedActionIds: [],
  weights: { ...DEFAULT_WEIGHTS },
};

const EMPTY_STATE: DemoTrackState = {
  preferences: EMPTY_PREFERENCES,
  generatedAt: null,
  visited: {},
};

const EVENT = "hiap-br-demo:changed";
const key = (city: string, track: DemoTrack) => `hiap-br-demo:${city}:${track}`;

/** Parsed snapshots are cached per raw string so `useSyncExternalStore` sees a stable value. */
const cache = new Map<string, { raw: string | null; parsed: DemoTrackState }>();

function parse(raw: string | null): DemoTrackState {
  if (!raw) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoTrackState>;
    return {
      preferences: {
        ...EMPTY_PREFERENCES,
        ...parsed.preferences,
        weights: { ...DEFAULT_WEIGHTS, ...parsed.preferences?.weights },
      },
      generatedAt: parsed.generatedAt ?? null,
      visited: parsed.visited ?? {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function readDemoState(city: string, track: DemoTrack): DemoTrackState {
  if (typeof window === "undefined") return EMPTY_STATE;
  const k = key(city, track);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(k);
  } catch {
    raw = null;
  }
  const cached = cache.get(k);
  if (cached && cached.raw === raw) return cached.parsed;
  const parsed = parse(raw);
  cache.set(k, { raw, parsed });
  return parsed;
}

export function writeDemoState(
  city: string,
  track: DemoTrack,
  next: DemoTrackState,
): void {
  try {
    window.localStorage.setItem(key(city, track), JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private windows; the demo still renders.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key(city, track) }));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

const serverSnapshot = () => EMPTY_STATE;
const noopSubscribe = () => () => {};

export function useDemoState(city: string, track: DemoTrack) {
  const state = useSyncExternalStore(
    subscribe,
    () => readDemoState(city, track),
    serverSnapshot,
  );
  // False on the server and the hydrating render, true once on the client —
  // screens use it to avoid flashing the empty state.
  const isReady = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const update = useCallback(
    (patch: (current: DemoTrackState) => DemoTrackState) => {
      writeDemoState(city, track, patch(readDemoState(city, track)));
    },
    [city, track],
  );

  const setPreferences = useCallback(
    (patch: Partial<DemoPreferences>) =>
      update((s) => ({
        ...s,
        preferences: { ...s.preferences, ...patch },
        visited: { ...s.visited, preferences: true },
      })),
    [update],
  );

  const markVisited = useCallback(
    (step: keyof DemoTrackState["visited"]) =>
      update((s) => ({ ...s, visited: { ...s.visited, [step]: true } })),
    [update],
  );

  const markGenerated = useCallback(
    () => update((s) => ({ ...s, generatedAt: new Date().toISOString() })),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY_STATE), [update]);

  return { state, isReady, setPreferences, markVisited, markGenerated, reset };
}
