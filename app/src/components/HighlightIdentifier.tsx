"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

export default function HighlightIdentifier() {
  const { data: session } = useSession();

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "test" &&
      hasFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED) &&
      session?.user?.email
    ) {
      // Dynamically import Highlight to avoid issues in test environment
      import("@highlight-run/next/client")
        .then(({ H }) => {
          H.identify(session.user.email, {
            id: session.user.id,
          });
        })
        .catch((error) => {
          console.warn("Failed to load Highlight client:", error);
        });
    }
  }, [session]);

  return null;
}
