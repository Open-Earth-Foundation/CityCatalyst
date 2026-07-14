import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { StationaryEnergyReviewPage } from "@/components/StationaryEnergyDraft/stationary-energy-review-page";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyReviewPage />;
}
