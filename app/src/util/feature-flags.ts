import { env } from "next-runtime-env";

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

export function hasFeatureFlag(flag: string): boolean {
  return getFeatureFlags().includes(flag);
}
