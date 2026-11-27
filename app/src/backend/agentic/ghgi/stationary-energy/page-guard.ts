import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

/** Check the running deployment's flags before rendering a draft page. */
export async function requireStationaryEnergyAgenticPageEnabled(): Promise<void> {
  // The Docker build has no runtime flags, so prerendering this check can save a 404.
  await connection();

  if (
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) ||
    !hasServerFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC)
  ) {
    notFound();
  }
}
