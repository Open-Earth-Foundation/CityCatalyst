import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { StationaryEnergyDecisionPage } from "@/components/StationaryEnergyDraft/StationaryEnergyDecisionPage";

export default function CityStationaryEnergyDraftPage() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyDecisionPage />;
}
