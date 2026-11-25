import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export async function requireConceptNoteBuilderPageEnabled(): Promise<void> {
  // Read flags from the running pod; without this, cacheComponents bakes the
  // empty build-time env (no flags) into the route shell as a 404.
  await connection();

  if (
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) ||
    !hasServerFeatureFlag(FeatureFlags.CONCEPT_NOTE_BUILDER)
  ) {
    notFound();
  }
}
