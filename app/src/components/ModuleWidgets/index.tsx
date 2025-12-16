"use client";

import React, { useState, useMemo } from "react";
import { VStack } from "@chakra-ui/react";
import { GHGIWidget } from "./GHGIWidget";
import { HIAPWidget } from "./HIAPWidget";
import { CCRAWidget } from "./CCRAMainWidget";
import { EmptyDashboard } from "../CityDashboard/EmptyDashboard";
import { TFunction } from "i18next";
import type {
  InventoryAttributes,
  PopulationAttributes,
} from "@/models/init-models";
import type {
  GHGInventorySummary,
  HIAPSummary,
  CCRASummary,
  CityWithProjectDataResponse,
} from "@/util/types";

interface ModuleDashboardWidgetsProps {
  cityId: string;
  lng: string;
  t: TFunction;
  isPublic?: boolean;
  year?: number;
  ghgiData?: GHGInventorySummary | null;
  hiapData?: HIAPSummary | null;
  ccraData?: CCRASummary | null;
  inventories?: InventoryAttributes[];
  city?: CityWithProjectDataResponse;
  population?: PopulationAttributes | null;
}

const WIDGET_COUNT = 3;

export const ModuleDashboardWidgets: React.FC<ModuleDashboardWidgetsProps> = ({
  cityId,
  lng,
  t,
  isPublic = false,
  year,
  ghgiData,
  hiapData,
  ccraData,
  inventories,
  city,
  population,
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
        isPublic={isPublic}
        year={year}
        ghgiData={ghgiData as GHGInventorySummary | undefined | null}
        inventories={inventories}
        population={population as PopulationAttributes | undefined | null}
      />
      <HIAPWidget
        cityId={cityId}
        lng={lng}
        onVisibilityChange={handleHIAPVisibility}
        isPublic={isPublic}
        year={year}
        hiapData={hiapData as HIAPSummary | undefined | null}
        inventories={inventories}
      />
      <CCRAWidget
        cityId={cityId}
        lng={lng}
        onVisibilityChange={handleCCRAVisibility}
        isPublic={isPublic}
        year={year}
        ccraData={ccraData as CCRASummary | undefined | null}
        inventories={inventories}
        city={city}
      />
    </VStack>
  );
};
