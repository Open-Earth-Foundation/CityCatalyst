"use client";

import { useEffect } from "react";
import { H } from "@highlight-run/next/client";
import { useSession } from "next-auth/react";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

export default function HighlightIdentifier() {
  const { data: session } = useSession();

  useEffect(() => {
    if (
      hasFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED) &&
      session?.user?.email
    ) {
      H.identify(session.user.email, {
        id: session.user.id,
      });
    }
  }, [session, FeatureFlags.HIGHLIGHT_ENABLED]);

  return null;
}
