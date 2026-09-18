"use client";
import type { TFunction } from "i18next";
import { MeedMeter } from "../../../components/MeedMeter";
import { LEVEL_KEYS, LEVEL_VALUE, levelTone, type Level } from "../labels";

export interface LevelMeterProps {
  label: string;
  level: Level;
  /** "needs" factors read well when low; "has" factors when high. */
  dir: "needs" | "has";
  t: TFunction;
}

/**
 * A single qualitative factor (capital intensity, delivery capacity, …).
 * Replaces the two divergent hand-rolled readouts — one a 6px bar, one a bare
 * label — with the module's one meter.
 */
export function LevelMeter({ label, level, dir, t }: LevelMeterProps) {
  const valueText = t(LEVEL_KEYS[level]);
  return (
    <MeedMeter
      value={LEVEL_VALUE[level]}
      tone={levelTone(level, dir)}
      label={label}
      valueText={valueText}
      ariaLabel={`${label} — ${valueText}`}
    />
  );
}
