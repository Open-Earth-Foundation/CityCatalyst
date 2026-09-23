"use client";
import { useMemo } from "react";
import { SECTORS } from "@/util/constants";
import type { CoBenefitKey, DemoTrack, RiskCellKey, Timeline } from "./types";
import { pick } from "./localized";
import { RISK_CELL_BY_KEY, SECTOR_LABEL } from "./riskCells";
import { CO_BENEFIT_LABEL } from "./coBenefits";
import { useTrackT } from "./useDemoT";

/** One place for the labels the preferences and config screens share. */
export function useLabels(lng: string, track: DemoTrack) {
  const tPrefs = useTrackT(lng, track, "meed-preferences");
  return useMemo(
    () => ({
      sector: (key: string) =>
        track === "adaptation"
          ? pick(
              SECTOR_LABEL[key as keyof typeof SECTOR_LABEL] ?? {
                en: key,
                pt: key,
              },
              lng,
            )
          : tPrefs(`sector-${key.replace(/_/g, "-")}`),
      coBenefit: (key: string) =>
        pick(
          CO_BENEFIT_LABEL[key as CoBenefitKey] ?? { en: key, pt: key },
          lng,
        ),
      timeline: (key: string) => {
        const map: Record<Timeline, string> = {
          "<5 years": "timeline-short",
          "5-10 years": "timeline-medium",
          ">10 years": "timeline-long",
        };
        return tPrefs(map[key as Timeline] ?? "timeline-no-preference");
      },
      cell: (key: string) =>
        RISK_CELL_BY_KEY[key as RiskCellKey]
          ? pick(RISK_CELL_BY_KEY[key as RiskCellKey].label, lng)
          : String(key),
      gpcSector: (name: string) => tPrefs(`sector-${name.replace(/_/g, "-")}`),
      gpcSectors: SECTORS.map((s) => s.name),
    }),
    [lng, track, tPrefs],
  );
}
