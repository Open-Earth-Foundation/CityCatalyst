"use client";

import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MdArrowForward, MdSearch } from "react-icons/md";

import { useTranslation } from "@/i18n/client";
import ProgressLoader from "@/components/ProgressLoader";
import { Button } from "@/components/ui/button";
import Wrapper from "@/components/wrapper";
import { api } from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { getParamValueRequired } from "@/util/helpers";
import type { CityYearData } from "@/util/types";

function yearLabel(year: CityYearData, fallbackLabel: string): string {
  return String(year.year ?? fallbackLabel);
}

export function StationaryEnergySelectorPage() {
  const router = useRouter();
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const featureEnabled =
    hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) &&
    hasFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC);

  const { data: cityYears, isLoading } = api.useGetCitiesAndYearsQuery();
  const [search, setSearch] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(
    null,
  );

  const selectableCities = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (cityYears ?? [])
      .map((entry) => ({
        city: entry.city,
        years: [...entry.years].sort((a, b) => b.year - a.year),
      }))
      .filter((entry) => entry.years.length > 0)
      .filter((entry) => {
        if (!term) {
          return true;
        }

        return [
          entry.city.name,
          entry.city.country,
          entry.city.region,
          ...entry.years.map((year) => String(year.year)),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      });
  }, [cityYears, search]);

  const selectedCity = selectableCities.find(
    (entry) => entry.city.cityId === selectedCityId,
  );
  const selectedInventory = selectedCity?.years.find(
    (year) => year.inventoryId === selectedInventoryId,
  );

  function selectCity(cityId: string) {
    const entry = selectableCities.find((item) => item.city.cityId === cityId);
    setSelectedCityId(cityId);
    setSelectedInventoryId(entry?.years[0]?.inventoryId ?? null);
  }

  function continueToDraft() {
    if (!lng || !selectedCityId || !selectedInventoryId) {
      return;
    }

    router.push(
      `/${lng}/cities/${selectedCityId}/GHGI/${selectedInventoryId}/draft/stationary-energy`,
    );
  }

  if (isLoading) {
    return <ProgressLoader />;
  }

  return (
    <Wrapper>
      <VStack align="stretch" gap={8} pb={16}>
        <Flex
          justifyContent="space-between"
          alignItems={{ base: "flex-start", md: "center" }}
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
        >
          <Box>
            <Heading
              color="content.primary"
              fontFamily="heading"
              fontSize="headline.lg"
              fontWeight="bold"
            >
              {t("selector-title")}
            </Heading>
            <Text color="content.tertiary" fontSize="body.lg" mt={2}>
              {t("selector-description")}
            </Text>
          </Box>
          <Badge>
            {featureEnabled
              ? t("selector-badge-enabled")
              : t("selector-badge-disabled")}
          </Badge>
        </Flex>

        {!featureEnabled && (
          <Box
            borderWidth="1px"
            borderColor="border.neutral"
            borderRadius="rounded"
            p={5}
          >
            <Text color="content.primary" fontWeight="semibold">
              {t("selector-flags-title")}
            </Text>
            <Text color="content.tertiary" mt={2}>
              {t("selector-flags-description")}
            </Text>
          </Box>
        )}

        {featureEnabled && (
          <SimpleGrid columns={{ base: 1, xl: 3 }} gap={6} alignItems="start">
            <VStack
              align="stretch"
              gap={4}
              gridColumn={{ base: "auto", xl: "span 2" }}
            >
              <Box position="relative">
                <Box
                  position="absolute"
                  left={3}
                  top="50%"
                  transform="translateY(-50%)"
                  color="content.tertiary"
                >
                  <MdSearch />
                </Box>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("selector-search-placeholder")}
                  pl={10}
                />
              </Box>

              <VStack align="stretch" gap={3}>
                {selectableCities.map((entry) => {
                  const isSelected = selectedCityId === entry.city.cityId;
                  return (
                    <Box
                      key={entry.city.cityId}
                      borderWidth="1px"
                      borderColor={
                        isSelected ? "interactive.control" : "border.neutral"
                      }
                      borderRadius="rounded"
                      p={4}
                      cursor="pointer"
                      bg={
                        isSelected ? "background.backgroundLight" : "base.light"
                      }
                      onClick={() => selectCity(entry.city.cityId)}
                    >
                      <Flex
                        justifyContent="space-between"
                        alignItems={{ base: "flex-start", md: "center" }}
                        flexDirection={{ base: "column", md: "row" }}
                        gap={3}
                      >
                        <Box>
                          <Heading fontSize="title.md" fontWeight="semibold">
                            {entry.city.name}
                          </Heading>
                          <Text color="content.tertiary" mt={1}>
                            {[entry.city.country, entry.city.region]
                              .filter(Boolean)
                              .join(", ")}
                          </Text>
                        </Box>
                        <HStack gap={2} flexWrap="wrap">
                          {entry.years.slice(0, 4).map((year) => (
                            <Badge key={year.inventoryId}>
                              {yearLabel(year, t("selector-unknown-year"))}
                            </Badge>
                          ))}
                        </HStack>
                      </Flex>

                      {isSelected && (
                        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mt={4}>
                          {entry.years.map((year) => {
                            const inventorySelected =
                              selectedInventoryId === year.inventoryId;
                            return (
                              <Button
                                key={year.inventoryId}
                                variant={
                                  inventorySelected ? "solid" : "outline"
                                }
                                justifyContent="space-between"
                                minH="48px"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedInventoryId(year.inventoryId);
                                }}
                              >
                                <span>
                                  {yearLabel(year, t("selector-unknown-year"))}
                                </span>
                                <span>
                                  {inventorySelected
                                    ? t("selector-inventory-selected")
                                    : t("selector-inventory-choose")}
                                </span>
                              </Button>
                            );
                          })}
                        </SimpleGrid>
                      )}
                    </Box>
                  );
                })}
              </VStack>
            </VStack>

            <Box
              borderWidth="1px"
              borderColor="border.neutral"
              borderRadius="rounded"
              p={5}
              bg="base.light"
              position={{ base: "static", xl: "sticky" }}
              top={6}
            >
              <Heading fontSize="title.lg" fontWeight="semibold">
                {t("selector-summary-title")}
              </Heading>
              <VStack align="stretch" gap={4} mt={5}>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    {t("selector-summary-city-label")}
                  </Text>
                  <Text fontWeight="semibold">
                    {selectedCity?.city.name ??
                      t("selector-summary-city-placeholder")}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    {t("selector-summary-inventory-label")}
                  </Text>
                  <Text fontWeight="semibold">
                    {selectedInventory
                      ? yearLabel(selectedInventory, t("selector-unknown-year"))
                      : t("selector-summary-inventory-placeholder")}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    {t("selector-summary-sector-label")}
                  </Text>
                  <Text fontWeight="semibold">
                    {t("selector-summary-sector-value")}
                  </Text>
                </Box>
                <Button
                  disabled={!selectedCityId || !selectedInventoryId}
                  onClick={continueToDraft}
                >
                  {t("selector-continue")}
                  <MdArrowForward />
                </Button>
              </VStack>
            </Box>
          </SimpleGrid>
        )}
      </VStack>
    </Wrapper>
  );
}
