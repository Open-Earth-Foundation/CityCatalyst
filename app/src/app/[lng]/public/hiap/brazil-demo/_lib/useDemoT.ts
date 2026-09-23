"use client";
/**
 * Translation for the demo, layered over the MEED namespaces.
 *
 * The reused MEED components read their copy from `meed-results`, `meed` and
 * friends — where "Reduction potential" and "Total city emissions" are the
 * right words for mitigation and the wrong ones for adaptation. Rather than
 * fork the components, the demo namespace can override any key per track:
 *
 *   hiap-demo.json → { "adaptation": { "meed-results": { "card-reduction-potential": "…" } } }
 *
 * `useTrackT(lng, track, "meed-results")` looks up
 * `adaptation.meed-results.<key>`, then `meed-results.<key>` in the demo
 * namespace, then falls back to the real namespace. Components see one `t`.
 */
import { useCallback, useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import type { DemoTrack } from "./types";

export const DEMO_NS = "hiap-demo";

export function useDemoT(lng: string) {
  return useTranslation(lng, DEMO_NS);
}

export function useTrackT(
  lng: string,
  track: DemoTrack,
  baseNs: string,
): TFunction {
  const { t: tDemo, i18n } = useTranslation(lng, DEMO_NS);
  const { t: tBase } = useTranslation(lng, baseNs);

  const resolve = useCallback(
    (key: string, options?: Record<string, unknown>) => {
      const candidates = [`${track}.${baseNs}.${key}`, `${baseNs}.${key}`];
      for (const candidate of candidates) {
        if (i18n.exists(candidate, { ns: DEMO_NS, lng, ...options })) {
          return tDemo(candidate, options as never);
        }
      }
      return tBase(key, options as never);
    },
    [track, baseNs, i18n, lng, tDemo, tBase],
  );

  return useMemo(() => resolve as unknown as TFunction, [resolve]);
}
