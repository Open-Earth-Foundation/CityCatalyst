import { TFunction } from "i18next";
import { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import {
  CountryEmissionsEntry,
  Inputs,
  OnboardingData,
} from "../../app/[lng]/onboarding/setup/page";
import { OCCityAttributes } from "@/util/types";
import { useGetOCCityDataQuery } from "@/services/api";
import { useEffect, useState } from "react";
import { findClosestYear } from "@/util/helpers";
import {
  Box,
  FormControl,
  FormErrorIcon,
  FormErrorMessage,
  Heading,
  HStack,
  InputGroup,
  InputRightElement,
  Select,
  Text,
} from "@chakra-ui/react";
import FormattedThousandsNumberInput from "@/app/[lng]/onboarding/setup/FormattedThousandsNumberInput";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import Checkmark from "./chekmark";

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
}: {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  errors: FieldErrors<Inputs>;
  control: Control<Inputs>;
  years: number[];
  watch: Function;
  ocCityData?: OCCityAttributes;
  setOcCityData: (cityData: OCCityAttributes) => void;
  setData: (data: OnboardingData) => void;
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
        console.error("Failed to find population data for city");
        return;
      }
      setValue("cityPopulation", population.population);
      setValue("cityPopulationYear", population.year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityData, year, setValue]);

  useEffect(() => {
    if (regionData && year) {
      const population = findClosestYear(
        regionData.population,
        year,
        numberOfYearsDisplayed,
      );
      if (!population) {
        console.error("Failed to find population data for region");
        return;
      }
      setValue("regionPopulation", population.population);
      setValue("regionPopulationYear", population.year);
    }
  }, [regionData, year, setValue]);

  useEffect(() => {
    if (countryData && year) {
      const population = findClosestYear(
        countryData.population,
        year,
        numberOfYearsDisplayed,
      );
      if (!population) {
        console.error("Failed to find population data for region");
        return;
      }
      let [{ datasource }] = countryData.population;
      setCountryPopulationSourceName(datasource.name);
      setValue("countryPopulation", population.population);
      setValue("countryPopulationYear", population.year);
      const keys = Object.keys(countryData.emissions);
      const sourceId = keys.find((id) => id.startsWith("UNFCCC"));

      if (sourceId) {
        const emissionsData: CountryEmissionsEntry[] =
          countryData.emissions[sourceId].data;
        const emissions = emissionsData.find(
          (e) => e.year === year,
        )?.total_emissions;
        if (emissions == null) {
          console.error("Failed to find country emissions for ", year);
        }
        setValue("totalCountryEmissions", emissions);
      }
    }
  }, [countryData, year, setValue]);

  const cityPopulation = watch("cityPopulation");
  const cityPopulationYear = watch("cityPopulationYear");

  const regionPopulation = watch("regionPopulation");
  const regionPopulationYear = watch("regionPopulationYear");

  const countryPopulation = watch("countryPopulation");
  const countryPopulationYear = watch("countryPopulationYear");

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
        <Heading data-testId="add-population-data-heading" size="xl">
          {t("setup-population-data-heading")}
        </Heading>
        <Text
          color="content.tertiary"
          fontSize="body.lg"
          fontStyle="normal"
          fontWeight="400"
          letterSpacing="wide"
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
              {t("Country")}
            </Text>
          </Box>
          <Box display="flex" gap="16px" alignItems="baseline">
            <HStack spacing={6} align="start">
              <FormControl isInvalid={!!errors.countryPopulation}>
                <FormattedThousandsNumberInput<Inputs>
                  name="countryPopulation"
                  control={control}
                  rules={{
                    required: t("population-required"),
                  }}
                  placeholder={t("country-population-placeholder")}
                  size="lg"
                  shadow="1dp"
                  w="400px"
                  fontSize="body.lg"
                  letterSpacing="wide"
                />
                <Box display="flex" gap="6px" alignItems="center" py="8px">
                  <InfoOutlineIcon color="interactive.control" />
                  <Text
                    color="content.tertiary"
                    fontSize="body.md"
                    letterSpacing="wide"
                    lineHeight="20px"
                  >
                    {t("source")}: {countryPopulationSourceName}
                  </Text>
                </Box>
                {errors.countryPopulation && (
                  <FormErrorMessage
                    color="content.tertiary"
                    letterSpacing="0.5px"
                  >
                    <FormErrorIcon />
                    {errors.countryPopulation.message}
                  </FormErrorMessage>
                )}
              </FormControl>
            </HStack>
            <FormControl isInvalid={!!errors.countryPopulationYear}>
              <InputGroup>
                <Select
                  placeholder={t("inventory-year-placeholder")}
                  size="lg"
                  w="217px"
                  shadow="1dp"
                  fontSize="body.lg"
                  fontStyle="normal"
                  letterSpacing="wide"
                  _placeholder={{ color: "content.tertiary" }}
                  py="16px"
                  px={0}
                  {...register("countryPopulationYear", {
                    required: t("inventory-year-required"),
                  })}
                >
                  {years.map((year: number, i: number) => (
                    <option value={year} key={i}>
                      {year}
                    </option>
                  ))}
                </Select>
                <InputRightElement
                  display="flex"
                  alignItems="center"
                  mt={5}
                  mr={6}
                >
                  <Checkmark
                    condition={!!countryPopulationYear && !!countryPopulation}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
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
              {t("region-or-province")}
            </Text>
          </Box>
          <Box display="flex" gap="16px" alignItems="baseline">
            <HStack spacing={6} align="start">
              <FormControl isInvalid={!!errors.regionPopulation}>
                <FormattedThousandsNumberInput<Inputs>
                  name="regionPopulation"
                  control={control}
                  rules={{
                    required: t("population-required"),
                  }}
                  placeholder={t("region-or-province-population-placeholder")}
                  size="lg"
                  shadow="1dp"
                  w="400px"
                  fontSize="body.lg"
                  letterSpacing="wide"
                />
                {errors.regionPopulation && (
                  <FormErrorMessage
                    color="content.tertiary"
                    letterSpacing="0.5px"
                  >
                    <FormErrorIcon />
                    {errors.regionPopulation.message}
                  </FormErrorMessage>
                )}
              </FormControl>
            </HStack>
            <FormControl isInvalid={!!errors.regionPopulationYear}>
              <InputGroup>
                <Select
                  placeholder={t("inventory-year-placeholder")}
                  size="lg"
                  w="217px"
                  shadow="1dp"
                  fontSize="body.lg"
                  fontStyle="normal"
                  letterSpacing="wide"
                  _placeholder={{ color: "content.tertiary" }}
                  py="16px"
                  px={0}
                  {...register("regionPopulationYear", {
                    required: t("inventory-year-required"),
                  })}
                >
                  {years.map((year: number, i: number) => (
                    <option value={year} key={i}>
                      {year}
                    </option>
                  ))}
                </Select>
                <InputRightElement mt={5} mr={6}>
                  <Checkmark
                    condition={!!regionPopulationYear && !!regionPopulation}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
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
              {t("city")}
            </Text>
          </Box>
          <Box display="flex" gap="16px" alignItems="baseline">
            <HStack spacing={6} align="start">
              <FormControl isInvalid={!!errors.cityPopulation}>
                <FormattedThousandsNumberInput<Inputs>
                  name="cityPopulation"
                  control={control}
                  rules={{
                    required: t("population-required"),
                  }}
                  placeholder={t("city-population-placeholder")}
                  size="lg"
                  shadow="1dp"
                  w="400px"
                  fontSize="body.lg"
                  letterSpacing="wide"
                />
                {errors.cityPopulation && (
                  <FormErrorMessage
                    color="content.tertiary"
                    letterSpacing="0.5px"
                  >
                    <FormErrorIcon />
                    {errors.cityPopulation.message}
                  </FormErrorMessage>
                )}
              </FormControl>
            </HStack>
            <FormControl isInvalid={!!errors.cityPopulationYear}>
              <InputGroup>
                <Select
                  placeholder={t("inventory-year-placeholder")}
                  size="lg"
                  w="217px"
                  shadow="1dp"
                  fontSize="body.lg"
                  fontStyle="normal"
                  letterSpacing="wide"
                  _placeholder={{ color: "content.tertiary" }}
                  py="16px"
                  px={0}
                  {...register("cityPopulationYear", {
                    required: t("inventory-year-required"),
                  })}
                >
                  {years.map((year: number, i: number) => (
                    <option value={year} key={i}>
                      {year}
                    </option>
                  ))}
                </Select>
                <InputRightElement mt={5} mr={6}>
                  <Checkmark
                    condition={!!cityPopulationYear && !!cityPopulation}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
