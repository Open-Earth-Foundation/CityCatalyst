import { getPublicRuntimeEnv } from "./keys";

/**
 * Server Component (no "use client") that injects window.__ENV on each request.
 * Do not add "use server" — that marks Server Actions, not Server Components.
 */
export function RuntimeEnvScript() {
  const publicEnv = getPublicRuntimeEnv();

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__ENV=${JSON.stringify(publicEnv)};`,
      }}
    />
  );
}
