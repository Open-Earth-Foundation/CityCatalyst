"use client";
import { Box, VStack } from "@chakra-ui/react";
import { Hero } from "@/components/GHGIHomePage/Hero";
import { InventoryResponse, CityWithProjectDataResponse } from "@/util/types";
import { PopulationAttributes } from "@/models/Population";
import { useTranslation } from "@/i18n/client";

interface MeedPageLayoutProps {
  inventory: InventoryResponse | null;
  formattedEmissions: { value: string; unit: string };
  lng: string;
  population: PopulationAttributes | null;
  children: React.ReactNode;
  city?: CityWithProjectDataResponse | undefined;
}

export function MeedPageLayout({
  inventory,
  formattedEmissions,
  lng,
  population,
  children,
  city,
}: MeedPageLayoutProps) {
  // Hero's own breadcrumb fallback only recognises GHGI/HIAP/dashboard paths,
  // so this module supplies its own label.
  const { t } = useTranslation(lng, "dashboard");

  return (
    <VStack h="full" bg="background.backgroundLight">
      <Hero
        inventory={inventory}
        isPublic={false}
        currentInventoryId={inventory?.inventoryId || null}
        isInventoryLoading={false}
        formattedEmissions={formattedEmissions}
        lng={lng}
        population={population}
        city={city}
        moduleLabel={t("breadcrumb-meed")}
      />

      <Box
        display="flex"
        mx="auto"
        py="56px"
        px="24px"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="24px"
      >
        {children}
      </Box>
    </VStack>
  );
}
