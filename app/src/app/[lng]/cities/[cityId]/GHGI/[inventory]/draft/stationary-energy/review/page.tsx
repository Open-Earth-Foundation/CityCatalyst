import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { StationaryEnergyReviewPage } from "@/components/StationaryEnergyDraft/StationaryEnergyReviewPage";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyReviewPage />;
}
