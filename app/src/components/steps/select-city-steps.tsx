import { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import {
  CountryEmissionsEntry,
  Inputs,
  OnboardingData,
} from "../../app/[lng]/onboarding/setup/page";
import { TFunction } from "i18next";
import { OCCityAttributes } from "@/util/types";
import { useAppDispatch } from "@/lib/hooks";
import { useEffect, useRef, useState } from "react";
import { set } from "@/features/city/openclimateCitySlice";
import {
  useGetCityQuery,
  useGetOCCityDataQuery,
  useGetOCCityQuery,
} from "@/services/api";
import { findClosestYear } from "@/util/helpers";
import {
  Box,
  Card,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Link,
  Text,
  useOutsideClick,
} from "@chakra-ui/react";
import {
  CheckIcon,
  InfoOutlineIcon,
  SearchIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import RecentSearches from "@/components/recent-searches";
import Image from "next/image";
import dynamic from "next/dynamic";
import { NoResultsIcon } from "../icons";
import { useSearchParams } from "next/navigation";
import { Trans } from "react-i18next";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

export default function SelectCityStep({
  errors,
  register,
  control,
  t,
  setValue,
  watch,
  ocCityData,
  setOcCityData,
  setData,
}: {
  errors: FieldErrors<Inputs>;
  register: UseFormRegister<Inputs>;
  control: Control<Inputs>;
  t: TFunction;
  setValue: any;
  watch: Function;
  ocCityData?: OCCityAttributes;
  setOcCityData: (cityData: OCCityAttributes) => void;
  setData: (data: OnboardingData) => void;
}) {
  const searchParams = useSearchParams();
  const cityFromUrl = searchParams.get("city");

  const currentYear = new Date().getFullYear();

  const numberOfYearsDisplayed = 10;

  const dispatch = useAppDispatch();

  const [onInputClicked, setOnInputClicked] = useState<boolean>(false);
  const [isCityNew, setIsCityNew] = useState<boolean>(false);
  const [locode, setLocode] = useState<string | null>();

  const yearInput = watch("year");
  const year: number | null = yearInput ? parseInt(yearInput) : null;
  const cityInputQuery = watch("city");

  const handleSetCity = (city: OCCityAttributes) => {
    setValue("city", city.name);
    setOnInputClicked(false);
    dispatch(set(city));
    setLocode(city.actor_id);
    setOcCityData(city);

    if (year) {
      setData({
        name: city.name,
        locode: city.actor_id!,
        year: year!,
        globalWarmingPotential: "",
        inventoryGoal: "",
      });
    }

    setIsCityNew(true);
  };

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

  useEffect(() => {
    if (!cityInputQuery || cityInputQuery.length === 0) {
      setOnInputClicked(false);
      setIsCityNew(false);
    }
  }, [cityInputQuery]);

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

  const { data: CCCityData } = useGetCityQuery(cityFromUrl as string, {
    skip: !cityFromUrl,
  });

  useEffect(() => {
    if (CCCityData) {
      setValue("city", CCCityData.name);
      setLocode(CCCityData.locode);
      setOcCityData({
        actor_id: CCCityData.locode?.split("-").join(" ") as string,
        name: CCCityData.name as string,
        is_part_of: CCCityData.regionLocode as string,
        root_path_geo: [],
        area: 0,
      });
    }
  }, [CCCityData]);

  // react to API data changes and different year selections
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

  // import custom redux hooks
  const {
    data: cities,
    isLoading,
    isSuccess,
  } = useGetOCCityQuery(cityInputQuery, {
    skip: cityInputQuery?.length <= 2,
  });

  const renderParentPath = (path: []) => {
    let pathString = "";
    const pathCopy = [...path];

    pathCopy
      ?.reverse()
      .slice(1)
      .map((parent: any) => {
        if (pathString) {
          pathString = pathString + " > ";
        }
        pathString = pathString + parent.name;
      });

    return pathString;
  };

  // using useOutsideClick instead of onBlur input attribute
  // to fix clicking city dropdown entries not working
  const cityInputRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: cityInputRef,
    handler: () => setTimeout(() => setOnInputClicked(false), 0),
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
        <Heading data-testId="setup-city-heading" size="xl">
          {t("setup-city-heading")}
        </Heading>
        <Text
          color="content.tertiary"
          fontSize="body.lg"
          fontStyle="normal"
          fontWeight="400"
          letterSpacing="wide"
          data-testId="setup-city-description"
        >
          {t("setup-city-details")}
        </Text>
      </Box>
      <Box w="full">
        <Card p={6} shadow="none" px="24px" py="32px">
          <form className="space-y-8">
            <FormControl isInvalid={!!errors.city}>
              <FormLabel data-testId="setup-city-input-label">
                {t("city")}
              </FormLabel>
              <InputGroup
                ref={cityInputRef}
                shadow="1dp"
                bg={errors.city ? "sentiment.negativeOverlay" : "base.light"}
                borderRadius="8px"
              >
                <InputLeftElement pointerEvents="none" borderRadius="none">
                  <SearchIcon color="tertiary" boxSize={4} mt={2} ml={4} />
                </InputLeftElement>
                <Input
                  type="text"
                  data-testId="setup-city-input"
                  placeholder={t("select-city-placeholder")}
                  size="lg"
                  {...register("city", {
                    required: t("select-city-required"),
                  })}
                  autoComplete="off"
                  onKeyUp={() => setOnInputClicked(true)}
                  onFocus={() => setOnInputClicked(true)}
                />
                <InputRightElement>
                  {isCityNew && (
                    <CheckIcon
                      color="semantic.success"
                      boxSize={4}
                      mr={4}
                      mt={2}
                    />
                  )}
                </InputRightElement>
              </InputGroup>
              {onInputClicked && (
                <Box
                  shadow="2dp"
                  className="h-auto max-h-[272px] transition-all duration-150 overflow-scroll flex flex-col py-3 gap-3 rounded-lg w-full absolute bg-white z-50 mt-2 border border-[1px solid #E6E7FF]"
                >
                  {!isLoading && !cityInputQuery && <RecentSearches />}
                  {isLoading && <p className="px-4">Fetching Cities...</p>}
                  {isSuccess &&
                    cities &&
                    cities.map((city: OCCityAttributes) => {
                      return (
                        <Box
                          onClick={() => handleSetCity(city)}
                          key={city.actor_id}
                          className="h-[72px] py-3 w-full flex flex-col justify-center group px-4 hover:bg-[#2351DC] transition-all duration-150 cursor-pointer"
                        >
                          <Text
                            className="group-hover:text-white"
                            color="content.secondary"
                            fontSize="body.lg"
                            fontFamily="body"
                            fontWeight="normal"
                            lineHeight="24"
                            letterSpacing="wide"
                          >
                            {city.name}
                          </Text>
                          <Text
                            className="group-hover:text-[#E8EAFB]"
                            color="content.tertiary"
                            fontSize="body.lg"
                            fontFamily="body.md"
                            fontWeight="normal"
                            lineHeight="20"
                            letterSpacing="wide"
                          >
                            {renderParentPath(city.root_path_geo)}
                          </Text>
                        </Box>
                      );
                    })}
                  {isSuccess && cities.length == 0 && (
                    <Box className="py-2 w-full items-center flex gap-4 px-4">
                      <Box h="full" display="flex" alignItems="center">
                        <Icon
                          as={NoResultsIcon}
                          color="content.secondary"
                          boxSize="24px"
                        />
                      </Box>
                      <Box display="flex" flexDir="column" gap="8px">
                        <Text
                          color="content.secondary"
                          fontSize="body.md"
                          fontFamily="body"
                          fontWeight="normal"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          {t("no-results")}
                        </Text>
                        <Text
                          color="content.tertiary"
                          fontSize="body.sm"
                          fontFamily="body"
                          fontWeight="normal"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          {t("no-results-details")}
                        </Text>
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
              <FormErrorMessage gap="6px">
                <WarningIcon />
                <Text
                  fontSize="body.md"
                  color="content.tertiary"
                  fontStyle="normal"
                >
                  {errors.city && errors.city.message}
                </Text>
              </FormErrorMessage>
            </FormControl>
            {ocCityData ? (
              <Box
                display="flex"
                flexDir="column"
                borderRadius="8px"
                w="full"
                h="full"
                gap="24px"
                overflow="hidden"
              >
                <CityMap
                  locode={ocCityData.actor_id}
                  height={500}
                  width={1100}
                />
                <Box display="flex" alignItems="center" gap="6px">
                  <InfoOutlineIcon />
                  <Text
                    color="content.secondary"
                    fontWeight="normal"
                    letterSpacing="wide"
                  >
                    <Trans i18nKey="city-boundary-info" t={t}>
                      <Link
                        color="content.link"
                        fontWeight="bold"
                        textDecoration="underline"
                        letterSpacing="wide"
                        href="mailto:greta@openearth.org"
                      >
                        Contact Us
                      </Link>
                    </Trans>
                  </Text>
                </Box>
              </Box>
            ) : (
              <Box
                bg="base.light"
                h="317px"
                w="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexDir="column"
                gap="24px"
                borderWidth={1}
                borderColor="border.neutral"
                borderStyle="dashed"
                borderRadius="8px"
              >
                <Image
                  src="/assets/city-image.svg"
                  alt="city-image"
                  height={400}
                  width={200}
                />
                <Box display="flex" flexDir="column" gap="8px">
                  <Text
                    color="content.tertiary"
                    fontSize="title.md"
                    fontWeight="bold"
                    lineHeight="24"
                    fontFamily="heading"
                    textAlign="center"
                  >
                    {t("unselected-city-boundary-heading")}
                  </Text>
                  <Text
                    color="interactive.control"
                    fontSize="body.md"
                    fontWeight="400"
                    fontStyle="normal"
                    lineHeight="24"
                    textAlign="center"
                    letterSpacing="wide"
                  >
                    {t("unselected-city-boundary-description")}
                  </Text>
                </Box>
              </Box>
            )}
          </form>
        </Card>
      </Box>
    </Box>
  );
}
