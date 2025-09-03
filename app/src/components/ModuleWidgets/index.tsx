"use client";

import React from "react";
import { VStack, Spinner, Box, Text, Progress } from "@chakra-ui/react";
import { useGetCityDashboardQuery } from "@/services/api";
import { Modules } from "@/util/constants";
import { GHGIWidget } from "./GHGIWidget";
import { HIAPWidget } from "./HIAPWidget";
import ProgressLoader from "../ProgressLoader";
import { EmptyDashboard } from "../CityDashboard/EmptyDashboard";
import { TFunction } from "i18next";
import { DashboardWidgetProps } from "./types";

interface ModuleDashboardWidgetsProps {
  cityId: string;
  lng: string;
  t: TFunction;
}

// Simple widget registry - map module IDs to their widget components
const WIDGET_REGISTRY: Record<string, React.FC<DashboardWidgetProps>> = {
  [Modules.GHGI.id]: GHGIWidget,
  [Modules.HIAP.id]: HIAPWidget,
};

export const ModuleDashboardWidgets: React.FC<ModuleDashboardWidgetsProps> = ({
  cityId,
  lng,
  t,
}) => {
  // Fetch all dashboard data with one query
  const {
    data: dashboardData,
    isLoading,
    error,
  } = useGetCityDashboardQuery({
    cityId,
    lng,
  });

  if (isLoading) {
    return <ProgressLoader />;
  }

  // Check if all modules have empty data
  const hasValidData =
    dashboardData &&
    Object.entries(dashboardData).some(([moduleId, moduleData]) => {
      // Check if module has actual inventory data
      if (moduleId === Modules.GHGI.id) {
        return (
          moduleData && !moduleData.error && moduleData.totalEmissions.total > 0
        );
      }
      if (moduleId === Modules.HIAP.id) {
        return (
          moduleData &&
          !moduleData.error &&
          (moduleData.mitigation || moduleData.adaptation)
        );
      }
      return false;
    });

  return (
    <>
      {dashboardData &&
      Object.keys(dashboardData).length > 0 &&
      hasValidData ? (
        <VStack gap={8} align="stretch" mt={4}>
          {Object.entries(dashboardData)
            .sort(([moduleIdA], [moduleIdB]) => {
              // Sort so GHGI appears first
              if (moduleIdA === Modules.GHGI.id) return -1;
              if (moduleIdB === Modules.GHGI.id) return 1;
              return 0;
            })
            .map(([moduleId, moduleData]) => {
              const WidgetComponent = WIDGET_REGISTRY[moduleId];
              if (!WidgetComponent) {
                // No widget registered for this module
                return null;
              }
              return (
                <Box key={moduleId} mb={4}>
                  <WidgetComponent
                    cityId={cityId}
                    lng={lng}
                    moduleId={moduleId}
                    data={moduleData || null}
                    isLoading={false}
                  />
                </Box>
              );
            })}
        </VStack>
      ) : (
        <EmptyDashboard t={t} />
      )}
    </>
  );
};
