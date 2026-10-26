import { env } from "@/lib/runtime-env";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

/**
 * Server-side counterpart to trackPageView in analytics.ts, called from proxy.ts
 * via after() so the capture request never delays the page response. Posts
 * directly to PostHog's capture API (same pattern as persistAnalyticsConsent)
 * instead of pulling in posthog-node, since proxy.ts may run on the Edge runtime.
 */
export function trackServerPageView({
  pathname,
  consentCookie,
  subjectKey,
}: {
  pathname: string;
  consentCookie: string | undefined;
  subjectKey: string | undefined;
}): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (!hasServerFeatureFlag(FeatureFlags.ANALYTICS_ENABLED)) {
    return;
  }

  if (consentCookie !== "true" || !subjectKey) {
    return;
  }

  const posthogKey = env("NEXT_PUBLIC_POSTHOG_KEY");
  if (!posthogKey) {
    return;
  }

  const posthogHost =
    env("NEXT_PUBLIC_POSTHOG_HOST") || "https://eu.i.posthog.com";

  void fetch(`${posthogHost}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: posthogKey,
      event: "$pageview",
      distinct_id: subjectKey,
      properties: {
        $current_url: pathname,
        environment: process.env.NODE_ENV,
        deployment_env:
          env("NEXT_PUBLIC_DEPLOYMENT_ENV") || process.env.NODE_ENV,
      },
    }),
  }).catch((error: unknown) => {
    console.warn("Failed to send server-side pageview", error);
  });
}
