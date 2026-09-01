import { Modules } from "./constants";

export type ModuleRouteSegment = {
  segment: "GHGI" | "HIAP" | "MEED" | "concept-notes" | "dashboard";
  moduleId?: string; // undefined => ungated route
};

const MODULE_ROUTES: ModuleRouteSegment[] = [
  { segment: "GHGI", moduleId: Modules.GHGI.id },
  { segment: "HIAP", moduleId: Modules.HIAP.id },
  { segment: "MEED", moduleId: Modules.MEED.id },
  { segment: "concept-notes", moduleId: Modules.CONCEPT_NOTE_BUILDER.id },
  { segment: "dashboard" },
];

/** Detect which module (if any) the given pathname is currently inside. */
export function getActiveModuleSegment(
  pathname: string | null,
): ModuleRouteSegment | null {
  if (!pathname) return null;
  return (
    MODULE_ROUTES.find((route) => pathname.includes(`/${route.segment}`)) ??
    null
  );
}

/**
 * Resolve where a city switch should land: the same module's root route for
 * the new city if that city's project has the module enabled, otherwise the
 * Journey Navigator home with `blockedModuleId` set so the caller can inform
 * the user.
 */
export function resolveCitySwitchPath({
  pathname,
  lng,
  newCityId,
  availableModuleIds,
}: {
  pathname: string | null;
  lng: string;
  newCityId: string;
  availableModuleIds: Set<string>;
}): { path: string; blockedModuleId?: string } {
  const journeyNavigatorPath = `/${lng}/cities/${newCityId}`;
  const active = getActiveModuleSegment(pathname);

  if (!active) {
    return { path: journeyNavigatorPath };
  }

  const modulePath = `${journeyNavigatorPath}/${active.segment}`;

  if (!active.moduleId || availableModuleIds.has(active.moduleId)) {
    return { path: modulePath };
  }

  return { path: journeyNavigatorPath, blockedModuleId: active.moduleId };
}
