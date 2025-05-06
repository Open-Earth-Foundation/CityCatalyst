import { env } from "next-runtime-env";

export enum FeatureFlags {
  ENTERPRISE_MODE = "ENTERPRISE_MODE",
  CAP_TAB_ENABLED = "CAP_TAB_ENABLED",
  PROJECT_OVERVIEW_ENABLED = "PROJECT_OVERVIEW_ENABLED"
}

let cachedFeatureFlags: string[] | null = null;

export function getFeatureFlags(): string[] {
  if (cachedFeatureFlags != null) {
    return cachedFeatureFlags;
  }

  const flags = env("NEXT_PUBLIC_FEATURE_FLAGS");

  if (flags) {
    cachedFeatureFlags = flags
      .split(",")
      .map((flag) => flag.trim())
      .filter((flag) => flag.length > 0);
  } else {
    cachedFeatureFlags = [];
  }

  return cachedFeatureFlags;
}

export function hasFeatureFlag(flag: FeatureFlags): boolean {
  return getFeatureFlags().includes(flag);
}
