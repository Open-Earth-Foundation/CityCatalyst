import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { StationaryEnergySelectorPage } from "@/components/StationaryEnergyDraft/StationaryEnergySelectorPage";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergySelectorPage />;
}
