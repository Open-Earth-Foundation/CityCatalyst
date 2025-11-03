import { hasServerFeatureFlag, FeatureFlags } from "@/util/feature-flags";

// Only import and initialize Highlight if not in test environment
let H: any = null;

if (process.env.NODE_ENV !== "test" && typeof window === "undefined") {
  const HighlightNext = require("@highlight-run/next/server");
  H = HighlightNext.H;

  // Initialize Highlight for server-side use only if feature flag is enabled
  if (hasServerFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED)) {
    H.init({
      projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID! || "4d7yymxd",
      // backendUrl: process.env.NEXT_PUBLIC_HIGHLIGHT_BACKEND_URL!,
      serviceName: `CityCatalystAPI-${process.env.NODE_ENV || "development"}`,
      tracingOrigins: true,
      networkRecording: {
        enabled: true,
        recordHeadersAndBody: true,
        urlBlocklist: [],
      },
    });
  }
}

export { H };
