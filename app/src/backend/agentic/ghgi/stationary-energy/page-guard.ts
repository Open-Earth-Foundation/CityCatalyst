import { notFound } from "next/navigation";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export function requireStationaryEnergyAgenticPageEnabled(): void {
  if (
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) ||
    !hasServerFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC)
  ) {
    notFound();
  }
}
