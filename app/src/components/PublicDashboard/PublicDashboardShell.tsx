"use client";

import { Box, HStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { useInventoryOrganization } from "@/hooks/use-inventory-organization";
import { Hero } from "../HomePageJN/Hero";
import { MdBarChart } from "react-icons/md";
import { HeadlineMedium } from "@/components/package/Texts/Headline";
import { ModuleDashboardWidgets } from "../ModuleWidgets";
import Footer from "../Sections/Footer";
import type {
  CityWithProjectDataResponse,
  GHGInventorySummary,
  HIAPSummary,
  CCRASummary,
  InventoryResponse,
} from "@/util/types";
import type {
  InventoryAttributes,
  PopulationAttributes,
} from "@/models/init-models";

interface PublicDashboardShellProps {
  lng: string;
  cityId: string;
  city: CityWithProjectDataResponse;
  inventories: InventoryAttributes[];
  population?: PopulationAttributes | null;
  latestInventory: InventoryAttributes | null;
  ghgiData: GHGInventorySummary | null;
  hiapData: HIAPSummary | null;
  ccraData: CCRASummary | null;
  hideMap?: boolean;
}

// Shared presentational shell for both public dashboard routes
// (/public/cities/{cityId}/dashboard and /public/dashboard/{cityId}/{year}).
// Receives already-resolved data from a server-rendered page - never
// fetches anything itself beyond translations and org theming, both of
// which only make sense client-side.
export function PublicDashboardShell({
  lng,
  cityId,
  city,
  inventories,
  population,
  latestInventory,
  ghgiData,
  hiapData,
  ccraData,
  hideMap = false,
}: PublicDashboardShellProps) {
  const { t } = useTranslation(lng, "dashboard");
  useInventoryOrganization(latestInventory?.inventoryId ?? "");

  return (
    <Box h="100%" minH="100vh" bg="base.light">
      <Hero
        city={city}
        ghgiCityData={latestInventory as InventoryResponse | undefined}
        isPublic={true}
        isLoading={false}
        t={t}
        population={population ?? undefined}
        hideMap={hideMap}
      />
      <Box maxW="1090px" mx="auto">
        <HStack gap={4} mb={6}>
          <MdBarChart color="#7A7B9A" />
          <HeadlineMedium>{t("journey.your-city-dashboard")}</HeadlineMedium>
        </HStack>
        <Box h="1px" mt="6" bg="border.neutral" />
        <ModuleDashboardWidgets
          cityId={cityId}
          lng={lng}
          t={t}
          isPublic
          ghgiData={ghgiData}
          hiapData={hiapData}
          ccraData={ccraData}
          inventories={inventories}
          city={city}
          population={population}
        />
      </Box>
      <Footer lng={lng} />
    </Box>
  );
}
