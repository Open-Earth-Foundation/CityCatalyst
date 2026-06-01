import StationaryEnergyReviewPage from "@/components/StationaryEnergyDraft/StationaryEnergyReviewPage";
import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";

export default function Page() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyReviewPage />;
}
