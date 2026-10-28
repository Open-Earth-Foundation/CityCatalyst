import { Modules } from "@/util/constants";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

type FeatureFlagChecker = (flag: FeatureFlags) => boolean;

export function isModuleVisible(
  moduleId: string,
  isFeatureEnabled: FeatureFlagChecker = hasFeatureFlag,
): boolean {
  if (moduleId === Modules.CCRA.id) {
    return isFeatureEnabled(FeatureFlags.CCRA_MODULE);
  }

  if (moduleId === Modules.CONCEPT_NOTE_BUILDER.id) {
    return (
      isFeatureEnabled(FeatureFlags.CA_SERVICE_INTEGRATION) &&
      isFeatureEnabled(FeatureFlags.CONCEPT_NOTE_BUILDER)
    );
  }

  return true;
}
