import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

// Only import and initialize Highlight if not in test environment
let H: any = null;

if (process.env.NODE_ENV !== "test" && typeof window === "undefined") {
  try {
    const HighlightNext = require("@highlight-run/next/server");
    H = HighlightNext.H;

    // Initialize Highlight for server-side use only if feature flag is enabled
    if (hasFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED)) {
      H.init({
        projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID!,
        // backendUrl: process.env.NEXT_PUBLIC_HIGHLIGHT_BACKEND_URL!,
        serviceName: "citycatalyst-api",
        tracingOrigins: true,
        networkRecording: {
          enabled: true,
          recordHeadersAndBody: true,
          urlBlocklist: [],
        },
      });
    }
  } catch (error) {
    console.warn("Failed to initialize Highlight:", error);
    H = null;
  }
}

export { H };
