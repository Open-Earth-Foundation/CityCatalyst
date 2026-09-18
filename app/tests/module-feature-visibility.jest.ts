import { describe, expect, it } from "@jest/globals";

import { Modules } from "@/util/constants";
import { FeatureFlags } from "@/util/feature-flags";
import { isModuleVisible } from "@/util/module-visibility";

function withFlags(...enabledFlags: FeatureFlags[]) {
  const enabled = new Set(enabledFlags);
  return (flag: FeatureFlags): boolean => enabled.has(flag);
}

describe("Journey Navigator module feature visibility", () => {
  it("shows Concept Note Builder only when both CNB dependencies are enabled", () => {
    expect(isModuleVisible(Modules.CONCEPT_NOTE_BUILDER.id, withFlags())).toBe(
      false,
    );
    expect(
      isModuleVisible(
        Modules.CONCEPT_NOTE_BUILDER.id,
        withFlags(FeatureFlags.CA_SERVICE_INTEGRATION),
      ),
    ).toBe(false);
    expect(
      isModuleVisible(
        Modules.CONCEPT_NOTE_BUILDER.id,
        withFlags(FeatureFlags.CONCEPT_NOTE_BUILDER),
      ),
    ).toBe(false);
    expect(
      isModuleVisible(
        Modules.CONCEPT_NOTE_BUILDER.id,
        withFlags(
          FeatureFlags.CA_SERVICE_INTEGRATION,
          FeatureFlags.CONCEPT_NOTE_BUILDER,
        ),
      ),
    ).toBe(true);
  });

  it("preserves the CCRA flag behavior", () => {
    expect(isModuleVisible(Modules.CCRA.id, withFlags())).toBe(false);
    expect(
      isModuleVisible(Modules.CCRA.id, withFlags(FeatureFlags.CCRA_MODULE)),
    ).toBe(true);
  });

  it("leaves modules without a feature gate visible", () => {
    expect(isModuleVisible(Modules.GHGI.id, withFlags())).toBe(true);
    expect(isModuleVisible(Modules.HIAP.id, withFlags())).toBe(true);
  });
});
