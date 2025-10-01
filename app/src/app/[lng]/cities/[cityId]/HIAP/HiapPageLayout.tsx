import { Box } from "@chakra-ui/react";
import { Hero } from "@/components/GHGIHomePage/Hero";
import { InventoryResponse, CityWithProjectDataResponse } from "@/util/types";
import { PopulationAttributes } from "@/models/Population";
import { TFunction } from "i18next";

interface HiapPageLayoutProps {
  inventory: InventoryResponse | null;
  formattedEmissions: { value: string; unit: string };
  lng: string;
  population: PopulationAttributes | null;
  children: React.ReactNode;
  city?: CityWithProjectDataResponse | undefined;
}

export function HiapPageLayout({
  inventory,
  formattedEmissions,
  lng,
  population,
  children,
  city,
}: HiapPageLayoutProps) {
  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Hero
        inventory={inventory}
        isPublic={false}
        currentInventoryId={inventory?.inventoryId || null}
        isInventoryLoading={false}
        formattedEmissions={formattedEmissions}
        lng={lng}
        population={population}
        city={city}
      />

      <Box
        display="flex"
        mx="auto"
        py="56px"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="24px"
      >
        {children}
      </Box>
    </Box>
  );
}
