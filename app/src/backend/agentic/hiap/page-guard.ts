import { notFound } from "next/navigation";

import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export function requireHiapAgenticPageEnabled(): void {
  if (!hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)) {
    notFound();
  }
}
