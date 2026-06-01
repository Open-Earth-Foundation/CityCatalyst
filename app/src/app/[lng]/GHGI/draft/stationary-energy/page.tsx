import StationaryEnergySelectorPage from "@/components/StationaryEnergyDraft/StationaryEnergySelectorPage";
import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergySelectorPage />;
}
