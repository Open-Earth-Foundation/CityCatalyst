import { H } from "@highlight-run/next/server";

// Initialize Highlight for server-side use
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

export { H };
