import { env } from "next-runtime-env";

export enum FeatureFlags {
  ENTERPRISE_MODE = "ENTERPRISE_MODE",
  PROJECT_OVERVIEW_ENABLED = "PROJECT_OVERVIEW_ENABLED",
  ACCOUNT_SETTINGS_ENABLED = "ACCOUNT_SETTINGS_ENABLED",
  UPLOAD_OWN_DATA_ENABLED = "UPLOAD_OWN_DATA_ENABLED",
  JN_ENABLED = "JN_ENABLED",
  OAUTH_ENABLED = "OAUTH_ENABLED",
  ANALYTICS_ENABLED = "ANALYTICS_ENABLED",
  CCRA_MODULE = "CCRA_MODULE",
  CA_SERVICE_INTEGRATION = "CA_SERVICE_INTEGRATION",
}

let cachedFeatureFlags: string[] | null = null;

export function getFeatureFlags(): string[] {
  if (cachedFeatureFlags != null) {
    return cachedFeatureFlags;
  }

  const flags = env("NEXT_PUBLIC_FEATURE_FLAGS");

  if (flags) {
    // Remove wrapping quotes and split, then clean each flag
    const cleanFlags = flags.replace(/^["']|["']$/g, '');
    cachedFeatureFlags = cleanFlags
      .split(",")
      .map((flag) => flag.trim().replace(/^["']|["']$/g, ''))
      .filter((flag) => flag.length > 0);
  } else {
    cachedFeatureFlags = [];
  }

  return cachedFeatureFlags;
}

export function hasFeatureFlag(flag: FeatureFlags): boolean {
  return getFeatureFlags().includes(flag);
}

export function setFeatureFlag(flag: FeatureFlags, enabled: boolean): boolean {
  // This forces the cache and always returns the same array
  const flags: string[] = getFeatureFlags();
  if (!flags) {
    throw new Error("No feature flags");
  }
  const idx = flags.indexOf(flag);

  if (enabled) {
    if (idx === -1) {
      flags.push(flag);
    }
  } else {
    if (idx !== -1) {
      flags.splice(idx, 1);
    }
  }

  // Return old enabled value

  return idx !== -1;
}

let cachedServerFeatureFlags: string[] | null = null;

export function getServerFeatureFlags(): string[] {
  if (cachedServerFeatureFlags != null) {
    return cachedServerFeatureFlags;
  }

  const flags = process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  if (!flags) {
    cachedServerFeatureFlags = [];
    return cachedServerFeatureFlags;
  }

  cachedServerFeatureFlags = flags
    .split(",")
    .map((flag) => flag.trim())
    .filter((flag) => flag.length > 0);

  return cachedServerFeatureFlags;
}

export function hasServerFeatureFlag(flag: FeatureFlags): boolean {
  return getServerFeatureFlags().includes(flag);
}
