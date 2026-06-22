import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { LegacyStationaryEnergyDraftRoute } from "@/components/StationaryEnergyDraft/LegacyStationaryEnergyDraftRoute";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <LegacyStationaryEnergyDraftRoute />;
}
