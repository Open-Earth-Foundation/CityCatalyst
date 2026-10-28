import { notFound } from "next/navigation";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export function requireConceptNoteBuilderPageEnabled(): void {
  if (
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) ||
    !hasServerFeatureFlag(FeatureFlags.CONCEPT_NOTE_BUILDER)
  ) {
    notFound();
  }
}
