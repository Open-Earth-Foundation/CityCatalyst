"use client";

import React, { useState, useMemo } from "react";
import { VStack } from "@chakra-ui/react";
import { GHGIWidget } from "./GHGIWidget";
import { HIAPWidget } from "./HIAPWidget";
import { CCRAWidget } from "./CCRAMainWidget";
import { EmptyDashboard } from "../CityDashboard/EmptyDashboard";
import { TFunction } from "i18next";

interface ModuleDashboardWidgetsProps {
  cityId: string;
  lng: string;
  t: TFunction;
  inventoryId?: string;
}

const WIDGET_COUNT = 3;

export const ModuleDashboardWidgets: React.FC<ModuleDashboardWidgetsProps> = ({
  cityId,
  lng,
  t,
  inventoryId,
}) => {
  const [widgetVisibility, setWidgetVisibility] = useState<
    Record<string, boolean>
  >({});

  const createVisibilityHandler = useMemo(() => {
    return (widgetId: string) => (hasContent: boolean) => {
      setWidgetVisibility((prev) => ({ ...prev, [widgetId]: hasContent }));
    };
  }, []);

  const handleGHGIVisibility = useMemo(
    () => createVisibilityHandler("ghgi"),
    [createVisibilityHandler],
  );
  const handleHIAPVisibility = useMemo(
    () => createVisibilityHandler("hiap"),
    [createVisibilityHandler],
  );
  const handleCCRAVisibility = useMemo(
    () => createVisibilityHandler("ccra"),
    [createVisibilityHandler],
  );

  const visibleWidgetCount =
    Object.values(widgetVisibility).filter(Boolean).length;
  const allWidgetsReported =
    Object.keys(widgetVisibility).length >= WIDGET_COUNT;
  const showEmptyState = allWidgetsReported && visibleWidgetCount === 0;

  if (showEmptyState) {
    return <EmptyDashboard t={t} />;
  }

  return (
    <VStack gap={8} align="stretch" mt={4} pb={10}>
      <GHGIWidget
        cityId={cityId}
        lng={lng}
        onVisibilityChange={handleGHGIVisibility}
      />
      <HIAPWidget
        cityId={cityId}
        lng={lng}
        onVisibilityChange={handleHIAPVisibility}
      />
    </VStack>
  );
};
