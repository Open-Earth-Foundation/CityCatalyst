/** NEXT_PUBLIC_* keys exposed to the browser at runtime via window.__ENV */
export const PUBLIC_RUNTIME_ENV_KEYS = [
  "NEXT_PUBLIC_FEATURE_FLAGS",
  "NEXT_PUBLIC_OPENCLIMATE_API_URL",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_DEPLOYMENT_ENV",
] as const;

export type PublicRuntimeEnvKey = (typeof PUBLIC_RUNTIME_ENV_KEYS)[number];

export function getPublicRuntimeEnv(): Record<PublicRuntimeEnvKey, string> {
  const result = {} as Record<PublicRuntimeEnvKey, string>;

  for (const key of PUBLIC_RUNTIME_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
