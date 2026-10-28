/** NEXT_PUBLIC_* keys exposed to the browser at runtime via window.__ENV */
export const PUBLIC_RUNTIME_ENV_KEYS = [
  "NEXT_PUBLIC_FEATURE_FLAGS",
  "NEXT_PUBLIC_OPENCLIMATE_API_URL",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_DEPLOYMENT_ENV",
  "NEXT_PUBLIC_SUPPORT_EMAILS",
  "NEXT_PUBLIC_CC_CCRA_REPLIT_URL",
  "NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID",
] as const;

export type PublicRuntimeEnvKey = (typeof PUBLIC_RUNTIME_ENV_KEYS)[number];

/**
 * Reads allowlisted NEXT_PUBLIC_* vars from process.env.
 * Intended to run on the server (e.g. from RuntimeEnvScript in the root layout)
 * so container/runtime values can be injected into the client via window.__ENV.
 * Next.js inlines process.env.NEXT_PUBLIC_* at build time in client bundles,
 * which would ignore k8s/runtime overrides — that is why we inject at request time.
 */
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
