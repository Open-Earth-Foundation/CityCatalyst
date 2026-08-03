"use client";
import React, { useMemo } from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetCityPopulationQuery,
  useGetInventoriesQuery,
} from "@/services/api";
import { Box, Card, HStack, Icon, SimpleGrid } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { formatEmissions } from "@/util/helpers";
import ProgressLoader from "@/components/ProgressLoader";
import { useRouter } from "next/navigation";
import { MeedPageLayout } from "../MeedPageLayout";
import {
  YearSelector,
  YearSelectorItem,
} from "@/components/shared/YearSelector";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyLarge } from "@/components/package/Texts/Body";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { getMeedPath, MEED_WIZARD_STEPS } from "../steps";

export default function MEEDInventoryPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = use(props.params);
  const { t } = useTranslation(lng, "meed");
  const router = useRouter();

  const {
    data: inventory,
    isLoading: isInventoryLoading,
    error: inventoryError,
  } = api.useGetInventoryQuery(inventoryId!, { skip: !inventoryId });

  const { data: city, isLoading: isCityLoading } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });

  // All inventories for the city, to populate the year selector
  const { data: allInventories, isLoading: isInventoriesLoading } =
    useGetInventoriesQuery({ cityId: cityId! }, { skip: !cityId });

  const inventoriesForYearSelector: YearSelectorItem[] = useMemo(() => {
    if (!allInventories) return [];
    return allInventories
      .filter((inv) => inv.year && inv.inventoryId)
      .map((inv) => ({
        year: inv.year!,
        inventoryId: inv.inventoryId,
        lastUpdate: inv.lastUpdated || new Date(),
      }))
      .sort((a, b) => a.year - b.year);
  }, [allInventories]);

  const handleYearSelect = (yearData: YearSelectorItem) => {
    router.push(`/${lng}/cities/${cityId}/MEED/${yearData.inventoryId}`);
  };

  const { data: userInfo } = api.useGetUserInfoQuery();
  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions, userInfo?.numberFormat)
    : { value: t("not-available"), unit: "" };

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  if (isInventoryLoading || isInventoriesLoading || isCityLoading) {
    return (
      <Box
        h="full"
        display="flex"
        flexDirection="column"
        bg="background.backgroundLight"
      >
        <ProgressLoader />
      </Box>
    );
  }

  if (inventoryError || !inventory) {
    return (
      <Box
        h="full"
        display="flex"
        flexDirection="column"
        bg="background.backgroundLight"
        py="56px"
      >
        <BodyLarge textAlign="center" color="content.secondary">
          {t("inventory-not-found")}
        </BodyLarge>
      </Box>
    );
  }

  return (
    <MeedPageLayout
      inventory={inventory}
      formattedEmissions={formattedEmissions}
      lng={lng}
      population={population ?? null}
      city={city}
    >
      <HStack justifyContent="space-between" w="full">
        <HeadlineSmall>{t("overview-title")}</HeadlineSmall>
        {inventoriesForYearSelector.length > 0 && (
          <YearSelector
            inventories={inventoriesForYearSelector}
            currentInventoryId={inventory.inventoryId}
            lng={lng}
            onYearSelect={handleYearSelect}
            t={t}
          />
        )}
      </HStack>
      <BodyLarge color="content.secondary">
        {t("overview-description")}
      </BodyLarge>
      <Card.Root>
        <Card.Body>
          <TitleMedium>{t("wizard-intro-title")}</TitleMedium>
          <BodyLarge color="content.secondary" mt="8px">
            {t("wizard-intro-description")}
          </BodyLarge>
          <Box mt="24px">
            <CCTerraButton
              onClick={() =>
                router.push(getMeedPath(lng, cityId, inventoryId, "emissions"))
              }
            >
              {t("start-wizard")}
            </CCTerraButton>
          </Box>
        </Card.Body>
      </Card.Root>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="16px">
        {MEED_WIZARD_STEPS.map((step, i) => (
          <Card.Root
            key={step.key}
            cursor="pointer"
            _hover={{ borderColor: "content.link" }}
            onClick={() =>
              router.push(getMeedPath(lng, cityId, inventoryId, step.segment))
            }
          >
            <Card.Body>
              <HStack justifyContent="space-between" alignItems="flex-start">
                <TitleMedium color="content.secondary">
                  {i + 1}. {t(step.labelKey)}
                </TitleMedium>
                <Icon as={LuArrowRight} color="content.link" />
              </HStack>
              <BodyLarge color="content.tertiary" mt="8px">
                {t(`${step.labelKey}-description`)}
              </BodyLarge>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>
    </MeedPageLayout>
  );
}
