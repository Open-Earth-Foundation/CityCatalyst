"use client";
import { useCallback } from "react";
import { usePathname } from "next/navigation";
import type { DemoTrack } from "./types";
import { isPreviousPath, previousHref, trackHref } from "./hrefs";

/**
 * `trackHref` for components the previous adaptation screens share with
 * mitigation (stepper, preferences, pre-flight, shell). Inside
 * `/adaptation/previous/…` an adaptation link stays in that section, so the
 * archived flow keeps working on its own; everywhere else it is the plain
 * route.
 */
export function useTrackHref() {
  const pathname = usePathname() ?? "";
  const inPrevious = isPreviousPath(pathname);
  return useCallback(
    (lng: string, city: string, track: DemoTrack, segment?: string) =>
      inPrevious && track === "adaptation"
        ? previousHref(lng, city, segment)
        : trackHref(lng, city, track, segment),
    [inPrevious],
  );
}
