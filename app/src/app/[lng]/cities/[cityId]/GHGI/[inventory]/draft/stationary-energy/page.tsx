import { requireStationaryEnergyAgenticPageEnabled } from "@/backend/agentic/ghgi/stationary-energy/page-guard";
import { StationaryEnergyDecisionPage } from "@/components/StationaryEnergyDraft/stationary-energy-decision-page";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function CityStationaryEnergyDraftPage() {
  requireStationaryEnergyAgenticPageEnabled();
  return <StationaryEnergyDecisionPage />;
}
