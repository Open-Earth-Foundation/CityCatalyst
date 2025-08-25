"use client";

import React from "react";
import { VStack, Spinner, Box, Text } from "@chakra-ui/react";
import { useGetCityDashboardQuery } from "@/services/api";
import { Modules } from "@/util/constants";
import { GHGIWidget } from "./GHGIWidget";
import { HIAPWidget } from "./HIAPWidget";

interface ModuleDashboardWidgetsProps {
  cityId: string;
  lng?: string;
}

// Simple widget registry - map module IDs to their widget components
const WIDGET_REGISTRY: Record<string, React.FC<any>> = {
  [Modules.GHGI.id]: GHGIWidget,
  [Modules.HIAP.id]: HIAPWidget,
};

export const ModuleDashboardWidgets: React.FC<ModuleDashboardWidgetsProps> = ({
  cityId,
  lng = "en",
}) => {
  // Fetch all dashboard data with one query
  const { data: dashboardData, isLoading, error } = useGetCityDashboardQuery({
    cityId,
    lng,
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={8}>
        <Spinner size="lg" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={8}>
        <Text color="red.500">Failed to load dashboard data</Text>
      </Box>
    );
  }

  if (!dashboardData || Object.keys(dashboardData).length === 0) {
    return (
      <Box p={8}>
        <Text color="gray.500">No modules available</Text>
      </Box>
    );
  }

  return (
    <VStack w="full" gap={4}>
      {Object.entries(dashboardData).map(([moduleId, moduleData]) => {
        const WidgetComponent = WIDGET_REGISTRY[moduleId];
        
        // If no widget registered for this module, show default
        if (!WidgetComponent) {
          return (
            <Box key={moduleId} p={4} borderWidth="1px" borderRadius="md" w="full">
              <Text>No widget for module: {moduleId}</Text>
            </Box>
          );
        }

        // Render the widget with its data
        return (
          <WidgetComponent
            key={moduleId}
            moduleId={moduleId}
            data={moduleData.error ? null : moduleData}
            error={moduleData.error}
          />
        );
      })}
    </VStack>
  );
};

/**
 * Usage in any component:
 * 
 * import { ModuleDashboardWidgets } from "@/components/ModuleWidgets";
 * 
 * <ModuleDashboardWidgets cityId={cityId} lng="en" />
 */