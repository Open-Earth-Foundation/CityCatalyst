import type { DemoTrack } from "./types";

export const DEMO_ROOT = "public/hiap/brazil-demo";

export function demoHome(lng: string): string {
  return `/${lng}/${DEMO_ROOT}`;
}

export function feedbackHref(lng: string): string {
  return `${demoHome(lng)}/feedback`;
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
  mitigation: {
    home: "BR-M1",
    // BR-M2 (results) merged into BR-M1.
    preferences: "BR-M3",
    preflight: "BR-M4",
    processing: "BR-M4b",
  },
} as const;
