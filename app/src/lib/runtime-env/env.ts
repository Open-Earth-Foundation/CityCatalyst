import type { PublicRuntimeEnvKey } from "./keys";

/**
 * Read a public env var from runtime process.env (server) or window.__ENV (client).
 * Client values come from RuntimeEnvScript injected at request time in k8s.
 */
export function env(key: PublicRuntimeEnvKey): string | undefined;
export function env(key: string): string | undefined;
export function env(key: string): string | undefined {
  if (typeof window !== "undefined") {
    return window.__ENV?.[key];
  }

  return process.env[key];
}
