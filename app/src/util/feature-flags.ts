import { env } from "next-runtime-env";

export enum FeatureFlags {
  ENTERPRISE_MODE = "ENTERPRISE_MODE",
  PROJECT_OVERVIEW_ENABLED = "PROJECT_OVERVIEW_ENABLED",
  ACCOUNT_SETTINGS_ENABLED = "ACCOUNT_SETTINGS_ENABLED",
  UPLOAD_OWN_DATA_ENABLED = "UPLOAD_OWN_DATA_ENABLED",
  JN_ENABLED = "JN_ENABLED",
  OAUTH_ENABLED = "OAUTH_ENABLED",
  ANALYTICS_ENABLED = "ANALYTICS_ENABLED",
  CCRA_MODULE = "CCRA_MODULE"
}

const QA_FLAGS_STORAGE_KEY = "qa_feature_flags";

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

/**
 * Get QA feature flag overrides from localStorage
 */
function getQAFeatureFlags(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {}; // Server-side, no localStorage
  }

  try {
    const stored = localStorage.getItem(QA_FLAGS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to parse QA feature flags:", error);
    return {};
  }
}

/**
 * Check if a feature flag is enabled
 * Priority: localStorage override (for QA) > environment variables
 */
export function hasFeatureFlag(flag: FeatureFlags): boolean {
  // Check QA override first (only client-side)
  if (typeof window !== "undefined") {
    const qaFlags = getQAFeatureFlags();
    if (flag in qaFlags) {
      return qaFlags[flag];
    }
  }

  // Fall back to environment variables
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

// =============================================================================
// QA FEATURE FLAG MANAGEMENT
// =============================================================================

/**
 * Set a QA feature flag override (for testing purposes)
 * This override takes precedence over environment variables
 *
 * @example
 * // In browser console or QA UI:
 * setQAFeatureFlag(FeatureFlags.CCRA_MODULE, true)
 */
export function setQAFeatureFlag(flag: FeatureFlags, enabled: boolean): void {
  if (typeof window === "undefined") {
    console.warn("QA feature flags can only be set client-side");
    return;
  }

  const qaFlags = getQAFeatureFlags();
  qaFlags[flag] = enabled;
  localStorage.setItem(QA_FLAGS_STORAGE_KEY, JSON.stringify(qaFlags));

  console.log(
    `✅ QA Feature Flag ${enabled ? "ENABLED" : "DISABLED"}: ${flag}`,
  );
}

/**
 * Remove a specific QA feature flag override
 * Falls back to environment variable setting
 */
export function clearQAFeatureFlag(flag: FeatureFlags): void {
  if (typeof window === "undefined") {
    return;
  }

  const qaFlags = getQAFeatureFlags();
  delete qaFlags[flag];
  localStorage.setItem(QA_FLAGS_STORAGE_KEY, JSON.stringify(qaFlags));

  console.log(`🔄 QA Feature Flag cleared: ${flag} (using env default)`);
}

/**
 * Clear all QA feature flag overrides
 */
export function clearAllQAFeatureFlags(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(QA_FLAGS_STORAGE_KEY);
  console.log("🧹 All QA feature flags cleared");
}

/**
 * Get all current QA feature flag overrides
 */
export function listQAFeatureFlags(): Record<string, boolean> {
  return getQAFeatureFlags();
}

/**
 * Log all feature flags (env + QA overrides) for debugging
 */
export function debugFeatureFlags(): void {
  const envFlags = getFeatureFlags();
  const qaFlags = getQAFeatureFlags();

  console.group("🚩 Feature Flags Status");
  console.log("Environment Flags:", envFlags);
  console.log("QA Overrides:", qaFlags);
  console.log("\nFinal Status:");
  Object.values(FeatureFlags).forEach((flag) => {
    const isEnabled = hasFeatureFlag(flag);
    const source = flag in qaFlags ? "QA Override" : "Environment";
    console.log(`  ${flag}: ${isEnabled ? "✅ ON" : "❌ OFF"} (${source})`);
  });
  console.groupEnd();
}

// Make QA functions globally available in browser console for easy testing
if (typeof window !== "undefined") {
  (window as any).qaFlags = {
    set: setQAFeatureFlag,
    clear: clearQAFeatureFlag,
    clearAll: clearAllQAFeatureFlags,
    list: listQAFeatureFlags,
    debug: debugFeatureFlags,
    FeatureFlags,
  };
}
