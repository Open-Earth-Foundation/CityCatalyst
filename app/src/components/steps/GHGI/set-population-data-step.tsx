import { TFunction } from "i18next";
import {
  Control,
  Controller,
  FieldErrors,
  UseFormSetValue,
} from "react-hook-form";
import type {
  GHGICountryEmissionsEntry,
  GHGIFormInputs,
} from "@/util/GHGI/types";
import { OCCityAttributes } from "@/util/types";
import { useGetOCCityDataQuery } from "@/services/api";
import { useEffect, useState } from "react";
import { findClosestYear } from "@/util/helpers";
import { Box, Heading, HStack, Icon, Text } from "@chakra-ui/react";
import FormattedThousandsNumber from "@/components/FormattedThousandsNumberInput";
import { MdErrorOutline, MdInfoOutline } from "react-icons/md";
import { Field } from "@/components/ui/field";
import { logger } from "@/services/logger";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

// Type for general onboarding data
type GeneralOnboardingData = {
  name: string;
  locode: string;
  year: number;
  inventoryGoal: string;
  globalWarmingPotential: string;
};

export default function SetPopulationDataStep({
  t,
  errors,
  control,
  years,
  ocCityData,
  watch,
  setValue,
  numberOfYearsDisplayed,
  setData,
  numberFormat,
}: {
  t: TFunction;
  errors: FieldErrors<GHGIFormInputs>;
  control: Control<GHGIFormInputs>;
  years: number[];
  watch: (name: string) => unknown;
  ocCityData?: OCCityAttributes;
  setData: (data: GeneralOnboardingData) => void;
  setValue: UseFormSetValue<GHGIFormInputs>;
  numberOfYearsDisplayed: number;
  numberFormat?: string;
}) {
  const yearInput = watch("year") as string | undefined;
  const year: number | null = yearInput ? parseInt(yearInput) : null;

  const locode = ocCityData?.actor_id;
  const { data: cityData } = useGetOCCityDataQuery(locode!, {
    skip: !locode,
  });
  const countryLocode =
    locode && locode.length > 0 ? locode.split(" ")[0] : null;
  const { data: countryData } = useGetOCCityDataQuery(countryLocode!, {
    skip: !countryLocode,
  });
  const regionLocode = cityData?.is_part_of;
  const { data: regionData } = useGetOCCityDataQuery(regionLocode!, {
    skip: !regionLocode,
  });
  const [countryPopulationSourceName, setCountryPopulationSourceName] =
    useState<string>("");
  useEffect(() => {
    if (cityData && year) {
      const population = findClosestYear(
        cityData.population,
        year,
        numberOfYearsDisplayed,
      );
      if (!population) {
        logger.error("Failed to find population data for city");
        return;
      }
      setValue("cityPopulation", population.population);
      setValue("cityPopulationYear", population.year);
    }
  }, [cityData, year, numberOfYearsDisplayed, setValue]);

  useEffect(() => {
    if (regionData && year) {
      const population = findClosestYear(
        regionData.population,
        year,
        numberOfYearsDisplayed,
      );
      if (!population) {
        logger.error("Failed to find population data for region");
        return;
      }
      setValue("regionPopulation", population.population);
      setValue("regionPopulationYear", population.year);
    }
  }, [regionData, year, numberOfYearsDisplayed, setValue]);

  useEffect(() => {
    if (countryData && year) {
      const population = findClosestYear(
        countryData.population,
        year,
        numberOfYearsDisplayed,
      );

      if (!population) {
        logger.error("Failed to find population data for region");
        return;
      }
      const [{ datasource }] = countryData.population;
      setCountryPopulationSourceName(datasource.name);
      setValue("countryPopulation", population.population);
      setValue("countryPopulationYear", population.year);
      const keys = Object.keys(countryData.emissions);
      const sourceId = keys.find((id) => id.startsWith("UNFCCC"));

      if (sourceId) {
        const emissionsData: GHGICountryEmissionsEntry[] =
          countryData.emissions[sourceId].data;
        const emissions = emissionsData.find(
          (e) => e.year === year,
        )?.total_emissions;
        if (emissions == null) {
          logger.error({ year: year }, "Failed to find country emissions for ");
          return;
        }
        setValue("totalCountryEmissions", emissions);
      }
    }
  }, [countryData, year, numberOfYearsDisplayed, setValue]);

  useEffect(() => {
    if (year && ocCityData) {
      setData({
        name: ocCityData.name,
        locode: ocCityData.actor_id,
        year: year!,
        globalWarmingPotential: "",
        inventoryGoal: "",
      });
    }
  }, [year, ocCityData, setData]);

  return (
    <Box w="full">
      <Box
        minW={400}
        w="full"
        display="flex"
        flexDir="column"
        gap="24px"
        mb="48px"
      >
        <Heading data-testid="add-population-data-heading" size="xl">
          {t("setup-population-data-heading")}
        </Heading>
        <Text
          color="content.tertiary"
          fontSize="body.lg"
          fontStyle="normal"
          fontWeight="400"
          letterSpacing="wide"
          data-testid="population-data-description"
        >
          {t("setup-population-data-description")}
        </Text>
      </Box>
      <Box
        w="full"
        py="36px"
        borderBottomWidth="2px"
        borderColor="border.overlay"
      >
        <Box
          display="flex"
          w="full"
          alignItems="center"
          justifyContent="space-between"
        >
          <Box>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
            >
              {t("country-population-title")}
            </Text>
          </Box>
          <Box display="flex" gap="16px" alignItems="start">
            <HStack spaceX={6} spaceY={6} align="start">
              <Field
                errorText={
                  errors.countryPopulation?.message && (
                    <Text color="content.tertiary" letterSpacing="0.5px">
                      <MdErrorOutline />
                      {errors.countryPopulation?.message}
                    </Text>
                  )
                }
              >
                <FormattedThousandsNumber
                  control={control}
                  name="countryPopulation"
                  size="lg"
                  w="400px"
                  placeholder={t("country-population-placeholder")}
                  data-testid="country-population-input"
                  rules={{
                    required: t("population-required"),
                    validate: (value) => {
                      return (
                        !isNaN(Number(value)) || t("population-must-be-number")
                      );
                    },
                  }}
                  numberFormat={numberFormat}
                />
                <Box display="flex" gap="6px" alignItems="center" py="8px">
                  <Icon as={MdInfoOutline} color="interactive.control" />
                  <Text
                    color="content.tertiary"
                    fontSize="body.md"
                    letterSpacing="wide"
                    lineHeight="20px"
                  >
                    {t("source")}: {countryPopulationSourceName}
                  </Text>
                </Box>
              </Field>
            </HStack>
            <Field
              errorText={
                errors.countryPopulationYear?.message && (
                  <Text color="content.tertiary" letterSpacing="0.5px">
                    <MdErrorOutline />
                    {errors.countryPopulationYear?.message}
                  </Text>
                )
              }
            >
              <Controller
                name="countryPopulationYear"
                control={control}
                rules={{
                  required: t("inventory-year-required"),
                }}
                render={({ field }) => (
                  <NativeSelectRoot
                    size="lg"
                    w="217px"
                    borderRadius="4px"
                    borderWidth="1px"
                    borderColor={
                      errors?.countryPopulationYear?.message
                        ? "sentiment.negativeDefault"
                        : ""
                    }
                    background={
                      errors?.countryPopulationYear?.message
                        ? "sentiment.negativeOverlay"
                        : ""
                    }
                  >
                    <NativeSelectField
                      name="countryPopulationYear"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(
                          e.target.value ? parseInt(e.target.value) : null,
                        );
                      }}
                    >
                      <option value="" disabled hidden>
                        {t("inventory-year-placeholder")}
                      </option>
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </NativeSelectField>
                  </NativeSelectRoot>
                )}
              />
            </Field>
          </Box>
        </Box>
      </Box>
      <Box
        w="full"
        py="36px"
        borderBottomWidth="2px"
        borderColor="border.overlay"
      >
        <Box
          display="flex"
          w="full"
          alignItems="center"
          justifyContent="space-between"
        >
          <Box>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
            >
              {t("region-or-province-population-title")}
            </Text>
          </Box>
          <Box display="flex" gap="16px" alignItems="start">
            <HStack spaceX={6} spaceY={6} align="start">
              <Field
                errorText={
                  <Text color="content.tertiary" letterSpacing="0.5px">
                    <MdErrorOutline />
                    {errors.regionPopulation?.message}
                  </Text>
                }
              >
                <FormattedThousandsNumber
                  control={control}
                  name="regionPopulation"
                  size="lg"
                  w="400px"
                  placeholder={t("region-or-province-population-placeholder")}
                  data-testid="region-population-input"
                  rules={{
                    required: t("population-required"),
                    validate: (value) => {
                      return (
                        !isNaN(Number(value)) || t("population-must-be-number")
                      );
                    },
                  }}
                  numberFormat={numberFormat}
                />
              </Field>
            </HStack>
            <Field
              errorText={
                <Text color="content.tertiary" letterSpacing="0.5px">
                  <MdErrorOutline />
                  {errors.regionPopulationYear?.message}
                </Text>
              }
            >
              <Controller
                name="regionPopulationYear"
                control={control}
                rules={{
                  required: t("inventory-year-required"),
                }}
                render={({ field }) => (
                  <NativeSelectRoot
                    size="lg"
                    w="217px"
                    borderRadius="4px"
                    borderWidth="1px"
                    borderColor={
                      errors?.regionPopulationYear?.message
                        ? "sentiment.negativeDefault"
                        : ""
                    }
                    background={
                      errors?.regionPopulationYear?.message
                        ? "sentiment.negativeOverlay"
                        : ""
                    }
                  >
                    <NativeSelectField
                      name="regionPopulationYear"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(
                          e.target.value ? parseInt(e.target.value) : null,
                        );
                      }}
                    >
                      <option value="" disabled hidden>
                        {t("inventory-year-placeholder")}
                      </option>
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </NativeSelectField>
                  </NativeSelectRoot>
                )}
              />
            </Field>
          </Box>
        </Box>
      </Box>
      <Box
        w="full"
        py="36px"
        borderBottomWidth="2px"
        borderColor="border.overlay"
      >
        <HStack
          w="full"
          alignItems="flex-start"
          justifyContent="space-between"
          align="start"
        >
          <Box>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
            >
              {t("city-population-title")}
            </Text>
          </Box>
          <Box display="flex" gap="16px" alignItems="start">
            <HStack spaceX={6} spaceY={6} align="start">
              <Field
                errorText={
                  errors.cityPopulation?.message && (
                    <Text color="content.tertiary" letterSpacing="0.5px">
                      <MdErrorOutline />
                      {errors.cityPopulation.message}
                    </Text>
                  )
                }
              >
                <FormattedThousandsNumber
                  control={control}
                  name="cityPopulation"
                  size="lg"
                  w="400px"
                  placeholder={t("city-population-placeholder")}
                  data-testid="city-population-input"
                  rules={{
                    required: t("population-required"),
                    validate: (value) => {
                      return (
                        !isNaN(Number(value)) || t("population-must-be-number")
                      );
                    },
                  }}
                  numberFormat={numberFormat}
                />
              </Field>
            </HStack>
            <Field
              errorText={
                errors.cityPopulationYear?.message && (
                  <Text color="content.tertiary" letterSpacing="0.5px">
                    <MdErrorOutline />
                    {errors.cityPopulationYear.message}
                  </Text>
                )
              }
            >
              <Controller
                name="cityPopulationYear"
                control={control}
                rules={{
                  required: t("inventory-year-required"),
                }}
                render={({ field }) => (
                  <NativeSelectRoot
                    size="lg"
                    w="217px"
                    borderRadius="4px"
                    borderWidth="1px"
                    borderColor={
                      errors?.cityPopulationYear?.message
                        ? "sentiment.negativeDefault"
                        : ""
                    }
                    background={
                      errors?.cityPopulationYear?.message
                        ? "sentiment.negativeOverlay"
                        : ""
                    }
                  >
                    <NativeSelectField
                      name="cityPopulationYear"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(
                          e.target.value ? parseInt(e.target.value) : null,
                        );
                      }}
                    >
                      <option value="" disabled hidden>
                        {t("inventory-year-placeholder")}
                      </option>
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </NativeSelectField>
                  </NativeSelectRoot>
                )}
              />
            </Field>
          </Box>
        </HStack>
      </Box>
    </Box>
  );
}
