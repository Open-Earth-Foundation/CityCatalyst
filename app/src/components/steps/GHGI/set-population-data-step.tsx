import { TFunction } from "i18next";
import { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import type {
  GHGICountryEmissionsEntry,
  GHGIFormInputs,
} from "@/util/GHGI/types";
import { OCCityAttributes } from "@/util/types";
import { useGetOCCityDataQuery } from "@/services/api";
import { useEffect, useState } from "react";
import { findClosestYear } from "@/util/helpers";
import {
  Box,
  createListCollection,
  Heading,
  Icon,
  Text,
} from "@chakra-ui/react";
import FormattedThousandsNumber from "../../../app/[lng]/cities/[cityId]/GHGI/onboarding/FormattedThousandsNumberInput";
import { MdCheck, MdErrorOutline, MdInfoOutline } from "react-icons/md";
import { Field } from "@/components/ui/field";
import { InputGroup } from "../../ui/input-group";
import { logger } from "@/services/logger";

// Type for general onboarding inputs
type GeneralInputs = {
  city: string;
  year: number;
  inventoryGoal: string;
  globalWarmingPotential: string;
  cityPopulation: number;
  cityPopulationYear: number;
  regionPopulation: number;
  regionPopulationYear: number;
  countryPopulation: number;
  countryPopulationYear: number;
  totalCountryEmissions: number;
};

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
  register,
  errors,
  control,
  years,
  ocCityData,
  watch,
  setValue,
  numberOfYearsDisplayed,
  setData,
}: {
  t: TFunction;
  register: UseFormRegister<GHGIFormInputs>;
  errors: FieldErrors<GHGIFormInputs>;
  control: Control<GHGIFormInputs>;
  years: number[];
  watch: Function;
  ocCityData?: OCCityAttributes;
  setData: (data: GeneralOnboardingData) => void;
  setValue: any;
  numberOfYearsDisplayed: number;
}) {
  const yearInput = watch("year");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      let [{ datasource }] = countryData.population;
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

  const yearsCollection = createListCollection({
    items: years.map((year) => ({
      label: year.toString(),
      value: year.toString(),
    })),
  });

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
        <Heading data-testid="population-data-heading" size="xl">
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
      {/* City Population */}
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
          <Box display="flex" flexDir="column" gap="16px">
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
            >
              {t("city-population")}
            </Text>
            <Text
              fontSize="title.md"
              fontStyle="normal"
              lineHeight="24px"
              letterSpacing="wide"
              color="content.tertiary"
            >
              {t("city-population-description")}
            </Text>
          </Box>
          <Box>
            <Field
              invalid={!!errors.cityPopulation}
              errorText={
                <Box gap="6px">
                  <Icon as={MdErrorOutline} boxSize={6} />
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    fontStyle="normal"
                  >
                    {errors.cityPopulation && errors.cityPopulation.message}
                  </Text>
                </Box>
              }
            >
              <InputGroup
                endElement={
                  !!watch("cityPopulation") && (
                    <Icon
                      as={MdCheck}
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
                    />
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
                    required: t("city-population-required"),
                  }}
                />
              </InputGroup>
            </Field>
          </Box>
        </Box>
      </Box>
      {/* Region Population */}
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
          <Box display="flex" flexDir="column" gap="16px">
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
            >
              {t("region-population")}
            </Text>
            <Text
              fontSize="title.md"
              fontStyle="normal"
              lineHeight="24px"
              letterSpacing="wide"
              color="content.tertiary"
            >
              {t("region-population-description")}
            </Text>
          </Box>
          <Box>
            <Field
              invalid={!!errors.regionPopulation}
              errorText={
                <Box gap="6px">
                  <Icon as={MdErrorOutline} boxSize={6} />
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    fontStyle="normal"
                  >
                    {errors.regionPopulation && errors.regionPopulation.message}
                  </Text>
                </Box>
              }
            >
              <InputGroup
                endElement={
                  !!watch("regionPopulation") && (
                    <Icon
                      as={MdCheck}
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
                    />
                  )
                }
              >
                <FormattedThousandsNumber
                  control={control}
                  name="regionPopulation"
                  size="lg"
                  w="400px"
                  placeholder={t("region-population-placeholder")}
                  data-testid="region-population-input"
                  rules={{
                    required: t("region-population-required"),
                  }}
                />
              </InputGroup>
            </Field>
          </Box>
        </Box>
      </Box>
      {/* Country Population */}
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
          <Box display="flex" flexDir="column" gap="16px">
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontStyle="normal"
              fontWeight="bold"
              lineHeight="24px"
            >
              {t("country-population")}
            </Text>
            <Text
              fontSize="title.md"
              fontStyle="normal"
              lineHeight="24px"
              letterSpacing="wide"
              color="content.tertiary"
            >
              {t("country-population-description")}
            </Text>
          </Box>
          <Box>
            <Field
              invalid={!!errors.countryPopulation}
              errorText={
                <Box gap="6px">
                  <Icon as={MdErrorOutline} boxSize={6} />
                  <Text
                    fontSize="body.md"
                    color="content.tertiary"
                    fontStyle="normal"
                  >
                    {errors.countryPopulation &&
                      errors.countryPopulation.message}
                  </Text>
                </Box>
              }
            >
              <InputGroup
                endElement={
                  !!watch("countryPopulation") && (
                    <Icon
                      as={MdCheck}
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
                    />
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
                    required: t("country-population-required"),
                  }}
                />
              </InputGroup>
            </Field>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
