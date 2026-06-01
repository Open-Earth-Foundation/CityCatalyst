import StationaryEnergyDecisionPage from "@/components/StationaryEnergyDraft/StationaryEnergyDecisionPage";
import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";

export default function CityStationaryEnergyDraftPage() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyDecisionPage />;
}
