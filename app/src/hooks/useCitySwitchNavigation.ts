"use client";

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { useGetModulesQuery } from "@/services/api";
import { resolveCitySwitchPath } from "@/util/module-navigation";
import { toaster } from "@/components/ui/toaster";
import type { ModuleAttributes } from "@/models/Module";

/**
 * Navigates to a city, preserving the current module (as detected from the
 * Modules table's `url`) when it's available for the target city, and
 * showing a toast when it isn't.
 */
export function useCitySwitchNavigation(lng: string) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation(lng, "navigation");
  const { data: allModules } = useGetModulesQuery();

  return useCallback(
    (newCityId: string, projectModules: ModuleAttributes[]) => {
      const availableModuleIds = new Set(
        projectModules.map((mod) => mod.id),
      );

      const { path, blockedModuleId } = resolveCitySwitchPath({
        pathname,
        lng,
        newCityId,
        modules: allModules ?? [],
        availableModuleIds,
      });

      if (blockedModuleId) {
        const blockedModule = projectModules.find(
          (mod) => mod.id === blockedModuleId,
        );
        toaster.create({
          type: "info",
          title: t("module-unavailable-for-city", {
            module: blockedModule?.name?.[lng] || blockedModule?.name?.en || "",
          }),
        });
      }

      router.push(path);
    },
    [pathname, lng, router, t, allModules],
  );
}
