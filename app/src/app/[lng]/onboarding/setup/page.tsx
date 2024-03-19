"use client";

import RecentSearches from "@/components/recent-searches";
import WizardSteps from "@/components/wizard-steps";
import { set } from "@/features/city/openclimateCitySlice";
import { useTranslation } from "@/i18n/client";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { CityAttributes } from "@/models/City";
import {
  useAddCityMutation,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useGetOCCityDataQuery,
  useGetOCCityQuery,
  useSetUserInfoMutation,
} from "@/services/api";
import { getShortenNumberUnit, shortenNumber } from "@/util/helpers";
import { OCCityAttributes } from "@/util/types";
import {
  ArrowBackIcon,
  CheckIcon,
  InfoOutlineIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import {
  Box,
  Button,
  Card,
  Flex,
  FormControl,
  FormErrorIcon,
  FormErrorMessage,
  FormLabel,
  HStack,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Select,
  Text,
  useOutsideClick,
  useSteps,
  useToast,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  FieldErrors,
  SubmitHandler,
  UseFormRegister,
} from "react-hook-form";
import { useForm } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineAspectRatio, MdOutlinePeopleAlt } from "react-icons/md";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

type Inputs = {
  city: string;
  year: number;
  cityPopulation: number;
  cityPopulationYear: number;
  regionPopulation: number;
  regionPopulationYear: number;
  countryPopulation: number;
  countryPopulationYear: number;
};

type PopulationEntry = {
  year: number;
  population: number;
  datasource_id: string;
};

const numberOfYearsDisplayed = 10;

/// Finds entry which has the year closest to the selected inventory year
function findClosestYear(
  populationData: PopulationEntry[] | undefined,
  year: number,
): PopulationEntry | null {
  if (!populationData || populationData?.length === 0) {
    return null;
  }
  return populationData.reduce(
    (prev, curr) => {
      // don't allow years outside of dropdown range
      if (curr.year < year - numberOfYearsDisplayed + 1) {
        return prev;
      }
      if (!prev) {
        return curr;
      }
      let prevDelta = Math.abs(year - prev.year);
      let currDelta = Math.abs(year - curr.year);
      return prevDelta < currDelta ? prev : curr;
    },
    null as PopulationEntry | null,
  );
}

function SetupStep({
  errors,
  register,
  t,
  setValue,
  watch,
  setOcCityData,
}: {
  errors: FieldErrors<Inputs>;
  register: UseFormRegister<Inputs>;
  t: TFunction;
  setValue: any;
  watch: Function;
  setOcCityData: Function;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: numberOfYearsDisplayed },
    (_x, i) => currentYear - i,
  );
  const dispatch = useAppDispatch();

  const [onInputClicked, setOnInputClicked] = useState<boolean>(false);
  const [isCityNew, setIsCityNew] = useState<boolean>(false);
  const [locode, setLocode] = useState<string | null>(null);

  const yearInput = watch("year");
  const year: number | null = yearInput ? parseInt(yearInput) : null;
  const cityInputQuery = watch("city");
  const cityPopulationYear = watch("cityPopulationYear");
  const regionPopulationYear = watch("regionPopulationYear");
  const countryPopulationYear = watch("countryPopulationYear");

  const handleSetCity = (city: OCCityAttributes) => {
    setValue("city", city.name);
    setOnInputClicked(false);
    dispatch(set(city));
    setLocode(city.actor_id);

    // TODO: chech whether city exists or not
    setIsCityNew(true);
  };

  useEffect(() => {
    if (!cityInputQuery || cityInputQuery.length === 0) {
      setOnInputClicked(false);
      setIsCityNew(false);
    }
  }, [cityInputQuery]);

  useEffect(() => {
    // reset population data when locode changes to prevent keeping data from previous city
    setValue("cityPopulationYear", null);
    setValue("cityPopulation", null);
    setValue("regionPopulation", null);
    setValue("regionYear", null);
    setValue("countryPopulation", null);
    setValue("countryYear", null);
  }, [locode, setValue]);

  const { data: cityData } = useGetOCCityDataQuery(locode!, {
    skip: !locode,
  });
  const countryLocode =
    locode && locode.length > 0 ? locode.split(" ")[0] : null;
  const { data: countryData } = useGetOCCityDataQuery(countryLocode!, {
    skip: !countryLocode,
  });
  const regionLocode = cityData?.data.is_part_of;
  const { data: regionData } = useGetOCCityDataQuery(regionLocode!, {
    skip: !regionLocode,
  });

  // react to API data changes and different year selections
  useEffect(() => {
    if (cityData && year) {
      setOcCityData(cityData);

      const population = findClosestYear(cityData?.data.population, year);
      if (!population) {
        console.error("Failed to find population data for city");
        return;
      }
      setValue("cityPopulation", population?.population);
      setValue("cityPopulationYear", population?.year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityData, year, setValue]);

  useEffect(() => {
    if (regionData && year) {
      const population = findClosestYear(regionData.data.population, year);
      if (!population) {
        console.error("Failed to find population data for region");
        return;
      }
      setValue("regionPopulation", population?.population);
      setValue("regionPopulationYear", population?.year);
    }
  }, [regionData, year, setValue]);

  useEffect(() => {
    if (countryData && year) {
      const population = findClosestYear(countryData.data.population, year);
      if (!population) {
        console.error("Failed to find population data for region");
        return;
      }
      setValue("countryPopulation", population?.population);
      setValue("countryPopulationYear", population?.year);
    }
  }, [countryData, year, setValue]);

  // import custom redux hooks
  const {
    data: cities,
    isLoading,
    isSuccess,
  } = useGetOCCityQuery(cityInputQuery, {
    skip: cityInputQuery?.length <= 2 ? true : false,
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
    <>
      <Box minW={400}>
        <Heading size="xl">{t("setup-heading")}</Heading>
        <Text className="my-4" color="tertiary">
          {t("setup-details")}
        </Text>
      </Box>
      <Box w="full">
        <Card p={6}>
          <form className="space-y-8">
            <FormControl isInvalid={!!errors.city}>
              <FormLabel>{t("select-city")}</FormLabel>
              <InputGroup ref={cityInputRef}>
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="tertiary" boxSize={4} mt={2} ml={4} />
                </InputLeftElement>
                <Input
                  type="text"
                  placeholder={t("select-city-placeholder")}
                  size="lg"
                  {...register("city", {
                    required: t("select-city-required"),
                  })}
                  autoComplete="off"
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
                </Box>
              )}
              <FormErrorMessage>
                {errors.city && errors.city.message}
              </FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={!!errors.year}>
              <FormLabel>{t("inventory-year")}</FormLabel>
              <InputGroup>
                <Select
                  placeholder={t("inventory-year-placeholder")}
                  size="lg"
                  {...register("year", {
                    required: t("inventory-year-required"),
                  })}
                >
                  {years.map((year: number, i: number) => (
                    <option value={year} key={i}>
                      {year}
                    </option>
                  ))}
                </Select>
                <InputRightElement>
                  {year && (
                    <CheckIcon
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
                    />
                  )}
                </InputRightElement>
              </InputGroup>
              <FormErrorMessage>
                {errors.year && errors.year.message}
              </FormErrorMessage>
            </FormControl>
            <HStack spacing={6} align="start">
              <FormControl isInvalid={!!errors.cityPopulation}>
                <FormLabel>{t("city-population-title")}</FormLabel>
                <Input
                  type="text"
                  placeholder={t("city-population-placeholder")}
                  size="lg"
                  {...register("cityPopulation", {
                    required: t("population-required"),
                  })}
                />
                <FormErrorMessage
                  color="content.tertiary"
                  letterSpacing="0.5px"
                >
                  <FormErrorIcon />
                  {errors.cityPopulation && errors.cityPopulation.message}
                </FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.cityPopulationYear} w={60}>
                <FormLabel>{t("population-year")}</FormLabel>
                <InputGroup>
                  <Select
                    placeholder={t("year-placeholder")}
                    size="lg"
                    {...register("cityPopulationYear", {
                      required: t("required"),
                    })}
                  >
                    {years.map((year: number, i: number) => (
                      <option value={year} key={i}>
                        {year}
                      </option>
                    ))}
                  </Select>
                  <InputRightElement>
                    {cityPopulationYear && (
                      <CheckIcon
                        color="semantic.success"
                        boxSize={4}
                        mt={2}
                        mr={10}
                      />
                    )}
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage
                  color="content.tertiary"
                  letterSpacing="0.5px"
                >
                  <FormErrorIcon />
                  {errors.cityPopulationYear &&
                    errors.cityPopulationYear.message}
                </FormErrorMessage>
              </FormControl>
            </HStack>
            <HStack spacing={6} align="start">
              <FormControl isInvalid={!!errors.regionPopulation}>
                <FormLabel>{t("region-population-title")}</FormLabel>
                <Input
                  type="text"
                  placeholder={t("region-population-placeholder")}
                  size="lg"
                  {...register("regionPopulation", {
                    required: t("population-required"),
                  })}
                />
                <FormErrorMessage
                  color="content.tertiary"
                  letterSpacing="0.5px"
                >
                  <FormErrorIcon />
                  {errors.regionPopulation && errors.regionPopulation.message}
                </FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!errors.regionPopulationYear} w={60}>
                <FormLabel>{t("population-year")}</FormLabel>
                <InputGroup>
                  <Select
                    placeholder={t("year-placeholder")}
                    size="lg"
                    {...register("regionPopulationYear", {
                      required: t("required"),
                    })}
                  >
                    {years.map((year: number, i: number) => (
                      <option value={year} key={i}>
                        {year}
                      </option>
                    ))}
                  </Select>
                  <InputRightElement>
                    {regionPopulationYear && (
                      <CheckIcon
                        color="semantic.success"
                        boxSize={4}
                        mt={2}
                        mr={10}
                      />
                    )}
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage
                  color="content.tertiary"
                  letterSpacing="0.5px"
                >
                  <FormErrorIcon />
                  {errors.regionPopulationYear &&
                    errors.regionPopulationYear.message}
                </FormErrorMessage>
              </FormControl>
            </HStack>
            <HStack spacing={6} align="start">
              <FormControl isInvalid={!!errors.countryPopulation}>
                <FormLabel>{t("country-population-title")}</FormLabel>
                <Input
                  type="text"
                  placeholder={t("country-population-placeholder")}
                  size="lg"
                  {...register("countryPopulation", {
                    required: t("population-required"),
                  })}
                />
                <FormErrorMessage
                  color="content.tertiary"
                  letterSpacing="0.5px"
                >
                  <FormErrorIcon />
                  {errors.countryPopulation && errors.countryPopulation.message}
                </FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!errors.countryPopulationYear} w={60}>
                <FormLabel>{t("population-year")}</FormLabel>
                <InputGroup>
                  <Select
                    placeholder={t("year-placeholder")}
                    size="lg"
                    {...register("countryPopulationYear", {
                      required: t("required"),
                    })}
                  >
                    {years.map((year: number, i: number) => (
                      <option value={year} key={i}>
                        {year}
                      </option>
                    ))}
                  </Select>
                  <InputRightElement>
                    {countryPopulationYear && (
                      <CheckIcon
                        color="semantic.success"
                        boxSize={4}
                        mt={2}
                        mr={10}
                      />
                    )}
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage
                  color="content.tertiary"
                  letterSpacing="0.5px"
                >
                  <FormErrorIcon />
                  {errors.countryPopulationYear &&
                    errors.countryPopulationYear.message}
                </FormErrorMessage>
              </FormControl>
            </HStack>
            <HStack spacing={1.5} align="start">
              <InfoOutlineIcon color="interactive.secondary" mt={1} />
              <Text
                color="content.tertiary"
                fontSize="sm"
                whiteSpace="pre-line"
              >
                {t("information-required")}
              </Text>
            </HStack>
          </form>
        </Card>
        <Text color="tertiary" mt={6} fontSize="sm">
          {t("gpc-basic-message")}
        </Text>
      </Box>
    </>
  );
}

function ConfirmStep({
  cityName,
  t,
  locode,
  area,
  population,
}: {
  cityName: String;
  t: TFunction;
  locode: string;
  area: number;
  population?: number;
}) {
  return (
    <>
      <div>
        <Heading size="lg">{t("confirm-heading")}</Heading>
        <Text className="my-4" color="tertiary">
          <Trans t={t} i18nKey="confirm-details">
            Review and confirm this information about your city. If there is an
            error please send us an email to edit it. We use{" "}
            <Link
              href="https://openclimate.network"
              target="_blank"
              rel="noreferrer"
            >
              open data sources
            </Link>{" "}
            to pre-fill the city profile.
          </Trans>
        </Text>
      </div>
      <div>
        <Card px={6} py={8}>
          <Heading fontSize="xl" color="brand">
            {cityName}
          </Heading>
          <Flex w={441} mt={12} justify="space-between">
            <div>
              <Icon as={MdOutlinePeopleAlt} boxSize={6} mt={1} mr={2} />
              <Box>
                <Text fontSize="xl">
                  {population ? (
                    <>
                      {shortenNumber(population)}
                      {getShortenNumberUnit(population)}
                    </>
                  ) : (
                    "N/A"
                  )}
                  <InfoOutlineIcon boxSize={4} mt={-0.5} ml={1} color="brand" />
                </Text>
                <Text fontSize="xs">{t("total-population")}</Text>
              </Box>
            </div>
            <div>
              <Icon as={MdOutlineAspectRatio} boxSize={6} mt={1} mr={2} />
              <Box>
                <Text fontSize="xl">
                  {area > 0 ? (
                    <>
                      {" "}
                      {area}km<sup>2</sup>
                    </>
                  ) : (
                    "N/A"
                  )}
                  <InfoOutlineIcon boxSize={4} mt={-0.5} ml={1} color="brand" />
                </Text>
                <Text fontSize="xs">{t("total-land-area")}</Text>
              </Box>
            </div>
          </Flex>
          <Text mb={4} mt={7}>
            {t("geographical-boundaries")}
          </Text>
          <CityMap locode={locode} height={400} width={450} />
        </Card>
      </div>
    </>
  );
}

export default function OnboardingSetup({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();
  const toast = useToast();
  const {
    handleSubmit,
    register,
    getValues,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const steps = [{ title: t("setup-step") }, { title: t("confirm-step") }];
  const { activeStep, goToNext, goToPrevious } = useSteps({
    index: 0,
    count: steps.length,
  });

  const [addCity] = useAddCityMutation();
  const [addCityPopulation] = useAddCityPopulationMutation();
  const [addInventory] = useAddInventoryMutation();
  const [setUserInfo] = useSetUserInfoMutation();

  const [data, setData] = useState<{
    name: string;
    locode: string;
    year: number;
  }>({ name: "", locode: "", year: -1 });
  const [ocCityData, setOcCityData] = useState<OCCityAttributes>();
  const [isConfirming, setConfirming] = useState(false);

  const makeErrorToast = (title: string, description?: string) => {
    toast({
      title,
      description,
      position: "top",
      status: "error",
      isClosable: true,
      duration: 10000,
    });
  };

  // TODO update form with population values from API
  const cityPopulation = watch("cityPopulation");
  const regionPopulation = watch("regionPopulation");
  const countryPopulation = watch("countryPopulation");

  const onConfirm = async () => {
    // save data in backend
    setConfirming(true);
    let city: CityAttributes | null = null;

    let area = ocCityData?.area ?? 0;
    let region =
      ocCityData?.root_path_geo.filter((item: any) => item.type === "adm1")[0]
        ?.name ?? "";
    let country =
      ocCityData?.root_path_geo.filter(
        (item: any) => item.type === "country",
      )[0]?.name ?? "";

    try {
      city = await addCity({
        name: data.name,
        locode: data.locode!,
        area,
        region,
        country,
      }).unwrap();
      await addCityPopulation({
        cityId: city.cityId,
        locode: city.locode!,
        population: cityPopulation!,
        regionPopulation: regionPopulation!,
        countryPopulation: countryPopulation!,
        // TODO add years for all 3 population entries
        year: data.year,
      }).unwrap();
    } catch (err: any) {
      makeErrorToast("Failed to add city!", err.data?.error?.message);
      setConfirming(false);
      return;
    }

    try {
      const inventory = await addInventory({
        cityId: city?.cityId!,
        year: data.year,
        inventoryName: `${data.name} - ${data.year}`,
      }).unwrap();
      await setUserInfo({
        cityId: city?.cityId!,
        defaultInventoryId: inventory.inventoryId,
      }).unwrap();
      setConfirming(false);
      router.push("/onboarding/done/" + data.locode + "/" + data.year);
    } catch (err: any) {
      console.error("Failed to create new inventory!", err);
      makeErrorToast("Failed to create inventory!", err.data?.error?.message);
      setConfirming(false);
    }
  };

  const onSubmit: SubmitHandler<Inputs> = async (newData) => {
    const year = Number(newData.year);

    if (!newData.city || !ocCityData?.actor_id || year < 0 || !data.locode) {
      // TODO show user toast? These should be caught by validation logic
      return;
    }

    setData({
      name: newData.city,
      locode: data.locode!,
      year,
    });

    goToNext();
  };

  return (
    <>
      <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto">
        <Button
          variant="ghost"
          leftIcon={<ArrowBackIcon boxSize={6} />}
          onClick={() => router.back()}
        >
          Go Back
        </Button>
        <div className="w-full flex justify-center">
          <div className="w-[800px]">
            <WizardSteps steps={steps} currentStep={activeStep} />
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:space-x-12 md:space-y-0 space-y-12 align-top mt-8 md:mt-16 mb-48">
          {activeStep === 0 && (
            <SetupStep
              errors={errors}
              setValue={setValue}
              register={register}
              watch={watch}
              setOcCityData={setOcCityData}
              t={t}
            />
          )}
          {activeStep === 1 && (
            <ConfirmStep
              cityName={getValues("city")}
              t={t}
              locode={data.locode}
              area={ocCityData?.area!}
              population={cityPopulation}
            />
          )}
        </div>
        <div className="bg-white w-full fixed z-[9999] bottom-0 left-0 border-t-4 border-brand flex flex-row py-8 px-8 drop-shadow-2xl hover:drop-shadow-4xl transition-all">
          <Box className="w-full">
            <Text fontSize="sm">Step {activeStep + 1}</Text>
            <Text fontSize="2xl" as="b">
              {steps[activeStep]?.title}
            </Text>
          </Box>
          {activeStep == 0 ? (
            <Button
              h={16}
              isLoading={isSubmitting}
              onClick={() => handleSubmit(onSubmit)()}
              px={12}
              size="sm"
            >
              {t("save-button")}
            </Button>
          ) : (
            <>
              <Button
                h={16}
                onClick={() => goToPrevious()}
                w={400}
                variant="ghost"
                leftIcon={<SearchIcon />}
                size="sm"
                px={12}
                mr={6}
              >
                {t("search-city-button")}
              </Button>
              <Button
                h={16}
                isLoading={isConfirming}
                px={16}
                onClick={onConfirm}
                size="sm"
              >
                {t("confirm-button")}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
