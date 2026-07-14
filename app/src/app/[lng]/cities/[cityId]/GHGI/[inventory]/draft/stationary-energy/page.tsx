import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { StationaryEnergyDecisionPage } from "@/components/StationaryEnergyDraft/stationary-energy-decision-page";

export default function CityStationaryEnergyDraftPage() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyDecisionPage />;
}
