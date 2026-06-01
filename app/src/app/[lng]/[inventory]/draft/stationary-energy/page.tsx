import LegacyStationaryEnergyDraftRoute from "@/components/StationaryEnergyDraft/LegacyStationaryEnergyDraftRoute";
import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <LegacyStationaryEnergyDraftRoute />;
}
