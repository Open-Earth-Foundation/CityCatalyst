"use client";

import React, { useState } from "react";
import { VStack } from "@chakra-ui/react";
import { GHGIWidget } from "./GHGIWidget";
import { HIAPWidget } from "./HIAPWidget";
import { EmptyDashboard } from "../CityDashboard/EmptyDashboard";
import { TFunction } from "i18next";

interface ModuleDashboardWidgetsProps {
  cityId: string;
  lng: string;
  t: TFunction;
}

export const ModuleDashboardWidgets: React.FC<ModuleDashboardWidgetsProps> = ({
  cityId,
  lng,
  t,
}) => {
  const [widgetVisibility, setWidgetVisibility] = useState<
    Record<string, boolean>
  >({});

  const handleWidgetVisibility = (widgetId: string, hasContent: boolean) => {
    setWidgetVisibility((prev) => ({ ...prev, [widgetId]: hasContent }));
  };

  const visibleWidgetCount =
    Object.values(widgetVisibility).filter(Boolean).length;
  const allWidgetsReported = Object.keys(widgetVisibility).length === 2;
  const showEmptyState = allWidgetsReported && visibleWidgetCount === 0;

  if (showEmptyState) {
    return <EmptyDashboard t={t} />;
  }

  return (
    <VStack gap={8} align="stretch" mt={4} pb={10}>
      <GHGIWidget
        cityId={cityId}
        lng={lng}
        onVisibilityChange={(hasContent: boolean) =>
          handleWidgetVisibility("ghgi", hasContent)
        }
      />
      <HIAPWidget
        cityId={cityId}
        lng={lng}
        onVisibilityChange={(hasContent: boolean) =>
          handleWidgetVisibility("hiap", hasContent)
        }
      />
    </VStack>
  );
};
