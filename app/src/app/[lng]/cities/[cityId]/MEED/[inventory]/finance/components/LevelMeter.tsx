"use client";
import type { TFunction } from "i18next";
import { MeedLevel } from "../../../components/MeedLevel";
import { LEVEL_KEYS, levelTone, type Level } from "../labels";

export interface LevelMeterProps {
  label: string;
  level: Level;
  /** "needs" factors read well when low; "has" factors when high. */
  dir: "needs" | "has";
  t: TFunction;
}

/**
 * A single qualitative factor (capital intensity, delivery capacity, …), as a
 * dot and a word. These are four-step scales, not measurements, so a bar
 * would suggest a precision the data does not have.
 */
export function LevelMeter({ label, level, dir, t }: LevelMeterProps) {
  return (
    <MeedLevel tone={levelTone(level, dir)} label={label}>
      {t(LEVEL_KEYS[level])}
    </MeedLevel>
  );
}
