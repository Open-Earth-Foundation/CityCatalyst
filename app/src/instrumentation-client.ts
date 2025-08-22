import { initializeAnalytics } from "@/lib/analytics";

// Wait for window.__ENV to be available before initializing analytics
if (typeof window !== "undefined") {
  // Check if __ENV is already available
  if (window.__ENV) {
    initializeAnalytics();
  } else {
    // If not, wait for it to be injected by PublicEnvScript
    const checkInterval = setInterval(() => {
      if (window.__ENV) {
        clearInterval(checkInterval);
        initializeAnalytics();
      }
    }, 100); // Check every 100ms

    // Stop checking after 5 seconds to prevent infinite loop
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
}
