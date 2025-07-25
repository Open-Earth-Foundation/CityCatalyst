import { H } from "@highlight-run/next/server";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

// Initialize Highlight for server-side use only if feature flag is enabled
if (hasFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED)) {
  H.init({
    projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID!,
    backendUrl: process.env.NEXT_PUBLIC_HIGHLIGHT_BACKEND_URL!,
    serviceName: "citycatalyst-api",
    tracingOrigins: true,
    networkRecording: {
      enabled: true,
      recordHeadersAndBody: true,
      urlBlocklist: [],
    },
  });
}

export { H };
