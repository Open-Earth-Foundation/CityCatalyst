import type { DemoTrack } from "./types";

export const DEMO_ROOT = "public/hiap/brazil-demo";

/**
 * Where the previous adaptation screens (BR-A1…A10) are kept for comparison
 * now that the proposal is the adaptation track: `/adaptation/previous/…`.
 */
export const PREVIOUS_SEGMENT = "previous";

/** Whether a pathname is inside the archived adaptation screens. */
export function isPreviousPath(pathname: string): boolean {
  return pathname.includes(`/adaptation/${PREVIOUS_SEGMENT}`);
}

/** A link into the archived adaptation screens. */
export function previousHref(lng: string, city: string, segment?: string) {
  return trackHref(
    lng,
    city,
    "adaptation",
    segment ? `${PREVIOUS_SEGMENT}/${segment}` : PREVIOUS_SEGMENT,
  );
}

export function demoHome(lng: string): string {
  return `/${lng}/${DEMO_ROOT}`;
}

export function trackHref(
  lng: string,
  city: string,
  track: DemoTrack,
  segment?: string,
): string {
  const base = `/${lng}/${DEMO_ROOT}/${city}/${track}`;
  return segment ? `${base}/${segment}` : base;
}

/** Stable screen IDs — what reviewers quote in the feedback sheet. */
export const SCREEN_IDS = {
  guide: "BR-00",
  adaptation: {
    home: "BR-A1",
    risk: "BR-A2",
    preferences: "BR-A3",
    preflight: "BR-A4",
    processing: "BR-A4b",
    // BR-A5 (results) merged into BR-A1: the home is the results screen.
    drawer: "BR-A6",
    legal: "BR-A7",
    finance: "BR-A8",
    policy: "BR-A9",
    context: "BR-A10",
  },
  /**
   * The adaptation screens since the October review (the proposal, now the
   * adaptation track). The BR-A IDs above are the previous version, kept
   * under `/adaptation/previous/`.
   */
  next: {
    home: "BR-N1",
    risk: "BR-N2",
    drawer: "BR-N6",
    legal: "BR-N7",
    finance: "BR-N8",
    policy: "BR-N9",
    context: "BR-N10",
  },
  mitigation: {
    home: "BR-M1",
    // BR-M2 (results) merged into BR-M1.
    preferences: "BR-M3",
    preflight: "BR-M4",
    processing: "BR-M4b",
  },
} as const;
