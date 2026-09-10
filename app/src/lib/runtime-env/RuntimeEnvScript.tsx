import { connection } from "next/server";

import { getPublicRuntimeEnv } from "./keys";

/**
 * Server Component (no "use client") that injects window.__ENV on each request.
 * Do not add "use server" — that marks Server Actions, not Server Components.
 *
 * `connection()` opts this render out of static prerender so process.env is read
 * from the running pod (k8s), not from the empty Docker build environment.
 */
export async function RuntimeEnvScript() {
  // Wait for a real request — otherwise Next bakes window.__ENV={} at build time.
  await connection();

  const publicEnv = getPublicRuntimeEnv();

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__ENV=${JSON.stringify(publicEnv)};`,
      }}
    />
  );
}
