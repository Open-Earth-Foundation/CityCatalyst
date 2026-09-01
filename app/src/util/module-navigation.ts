import type { ModuleAttributes } from "@/models/Module";

/** Journey Navigator home isn't a gated module, so it has no DB row/moduleId. */
const DASHBOARD_SEGMENT = "dashboard";

export type ActiveModule = {
  segment: string;
  moduleId?: string; // undefined => ungated route (e.g. dashboard)
  name?: ModuleAttributes["name"];
};

/**
 * Detect which module (if any) the given pathname is currently inside, using
 * each module's `url` (e.g. "/GHGI") as its route segment. Falls back to the
 * ungated Journey Navigator dashboard route, which has no module row.
 */
export function getActiveModuleSegment(
  pathname: string | null,
  modules: ModuleAttributes[],
): ActiveModule | null {
  if (!pathname) return null;

  for (const mod of modules) {
    if (!mod.url.startsWith("/")) continue; // external tool, not an app route
    const segment = mod.url.slice(1);
    if (pathname.includes(`/${segment}`)) {
      return { segment, moduleId: mod.id, name: mod.name };
    }
  }

  if (pathname.includes(`/${DASHBOARD_SEGMENT}`)) {
    return { segment: DASHBOARD_SEGMENT };
  }

  return null;
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
  modules,
  availableModuleIds,
}: {
  pathname: string | null;
  lng: string;
  newCityId: string;
  modules: ModuleAttributes[];
  availableModuleIds: Set<string>;
}): { path: string; blockedModuleId?: string } {
  const journeyNavigatorPath = `/${lng}/cities/${newCityId}`;
  const active = getActiveModuleSegment(pathname, modules);

  if (!active) {
    return { path: journeyNavigatorPath };
  }

  const modulePath = `${journeyNavigatorPath}/${active.segment}`;

  if (!active.moduleId || availableModuleIds.has(active.moduleId)) {
    return { path: modulePath };
  }

  return { path: journeyNavigatorPath, blockedModuleId: active.moduleId };
}
