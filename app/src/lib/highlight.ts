import type * as HighlightNextServer from "@highlight-run/next/server";
import { env } from "@/lib/runtime-env";

// Only import and initialize Highlight if not in test environment
let H: typeof HighlightNextServer.H | null = null;

if (process.env.NODE_ENV !== "test" && typeof window === "undefined") {
  try {
    const HighlightNext = await import("@highlight-run/next/server");
    H = HighlightNext.H;

    // Always initialize Highlight - feature flag control happens at usage sites
    H.init({
      projectID: env("NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID") || "4d7yymxd",
      // backendUrl: process.env.NEXT_PUBLIC_HIGHLIGHT_BACKEND_URL!,
      serviceName: `CityCatalystAPI-${process.env.NODE_ENV || "development"}`,
      tracingOrigins: true,
      networkRecording: {
        enabled: true,
        recordHeadersAndBody: true,
        urlBlocklist: [],
      },
    });
  } catch (error) {
    // Silently fail if Highlight can't be loaded (e.g., in test environment)
    console.warn("Failed to initialize Highlight:", error);
    H = null;
  }
}

export { H };
