import { getPublicRuntimeEnv } from "./keys";

/** Injects window.__ENV so NEXT_PUBLIC_* vars can differ at runtime from build time. */
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
