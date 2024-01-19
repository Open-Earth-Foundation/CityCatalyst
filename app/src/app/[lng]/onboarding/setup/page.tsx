"use client";

import RecentSearches from "@/components/recent-searches";
import WizardSteps from "@/components/wizard-steps";
import { set } from "@/features/city/openclimateCitySlice";
import { useTranslation } from "@/i18n/client";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { OCCityArributes } from "@/models/City";
import {
  useAddCityMutation,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useGetOCCityDataQuery,
  useGetOCCityQuery,
  useSetUserInfoMutation,
} from "@/services/api";
import { getShortenNumberUnit, shortenNumber } from "@/util/helpers";
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
  FormErrorMessage,
  FormLabel,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Select,
  Text,
  useSteps,
  useToast,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FieldErrors,
  SubmitHandler,
  UseFormRegister,
  useForm,
} from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineAspectRatio, MdOutlinePeopleAlt } from "react-icons/md";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

type Inputs = {
  city: string;
  year: number;
};

function SetupStep({
  errors,
  register,
  t,
  setValue,
}: {
  errors: FieldErrors<Inputs>;
  register: UseFormRegister<Inputs>;
  t: TFunction;
  setValue: any;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_x, i) => currentYear - i);

  const [onInputClicked, setOnInputClicked] = useState<boolean>(false);
  const [cityInputQuery, setCityInputQuery] = useState<string>("");
  const [isCityNew, setIsCityNew] = useState<boolean>(false);
  const [isYearSelected, setIsYearSelected] = useState<boolean>(false);
  const [yearValue, setYearValue] = useState<number>();
  const dispatch = useAppDispatch();

  const handleInputOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setCityInputQuery(e.target.value);
    setOnInputClicked(true);
  };

  const handleSetCity = (city: OCCityArributes) => {
    setCityInputQuery(city.name);
    setOnInputClicked(false);
    dispatch(set(city));

    // TODO: chech whether city exists or not
    setIsCityNew(true);
  };

  const handleYear = (e: any) => {
    setIsYearSelected(true);
    setYearValue(e.target.value);
  };

  useEffect(() => {
    setValue("city", cityInputQuery);
  }, [cityInputQuery, setValue]);

  useEffect(() => {
    if (cityInputQuery.length === 0) {
      setOnInputClicked(false);
      setIsCityNew(false);
    }
    if (!yearValue) {
      setIsYearSelected(false);
    }
  }, [cityInputQuery, yearValue]);

  // import custom redux hooks
  const {
    data: cities,
    isLoading,
    isSuccess,
    isError,
  } = useGetOCCityQuery(cityInputQuery, {
    skip: cityInputQuery.length <= 2 ? true : false,
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

  return (
    <>
      <div>
        <Heading size="xl">{t("setup-heading")}</Heading>
        <Text className="my-4" color="tertiary">
          {t("setup-details")}
        </Text>
      </div>
      <div>
        <Card p={6}>
          <form>
            <FormControl isInvalid={!!errors.city} mb={12}>
              <FormLabel>{t("select-city")}</FormLabel>
              <InputGroup>
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="tertiary" boxSize={4} mt={2} ml={4} />
                </InputLeftElement>
                <Input
                  type="text"
                  placeholder={t("select-city-placeholder")}
                  w={441}
                  size="lg"
                  {...register("city", {
                    required: t("select-city-required"),
                  })}
                  onChange={handleInputOnChange}
                  value={cityInputQuery}
                />
                <InputRightElement>
                  {isCityNew && (
                    <CheckIcon
                      color="semantic.success"
                      boxSize={4}
                      mt={2}
                      mr={10}
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
                    cities.map((city: any) => {
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
                  onChange={handleYear}
                >
                  {years.map((year: number, i: number) => (
                    <option value={year} key={i}>
                      {year}
                    </option>
                  ))}
                </Select>
                <InputRightElement>
                  {isYearSelected && (
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
          </form>
        </Card>
        <Text color="tertiary" mt={6} fontSize="sm">
          {t("gpc-basic-message")}
        </Text>
      </div>
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
  population: number;
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

  const [isConfirming, setConfirming] = useState(false);
  const [populationData, setPopulationData] = useState<{
    year: number;
    population: number;
    datasourceId: string;
  }>({ year: 0, population: 0, datasourceId: "" });
  const [countryPopulation, setCountryPopulation] = useState<number>(0);

  const storedData = useAppSelector((state) => state.openClimateCity);

  const onSubmit: SubmitHandler<Inputs> = async (newData) => {
    const year = Number(newData.year);
    if (!newData.city || !storedData.city?.actor_id || year < 0) {
      return;
    }

    setData({
      name: newData.city,
      locode: storedData.city?.actor_id,
      year,
    });

    goToNext();
  };

  const { data: cityData } = useGetOCCityDataQuery(data.locode, {
    skip: !data.locode,
  });
  const countryLocode = data.locode.length > 0 ? data.locode.split(" ")[0] : null;
  const { data: countryData } = useGetOCCityDataQuery(countryLocode!, {
    skip: !countryLocode,
  });

  const makeErrorToast = (title: string, description?: string) => {
    toast({
      title,
      description,
      status: "error",
      isClosable: true,
    });
  };

  const [ocCityData, setOcCityData] = useState<{
    area: number;
    region: string;
    country: string;
  }>();

  useEffect(() => {
    if (cityData) {
      const population = cityData?.data.population.filter(
        (item: any) => item.year === data.year,
      );
      const populationObject = {
        year: population[0]?.year,
        population: population[0]?.population,
        datasourceId: population[0]?.datasource_id,
      };
      setPopulationData(populationObject);

      const cityObject = {
        area: cityData.data?.territory?.area ?? 0,
        region:
          storedData.city?.root_path_geo.filter(
            (item: any) => item.type === "adm1",
          )[0]?.name ?? "",
        country:
          storedData.city?.root_path_geo.filter(
            (item: any) => item.type === "country",
          )[0]?.name ?? "",
      };

      setOcCityData(cityObject);
    }
  }, [cityData, storedData.city?.root_path_geo, data.year]);

  useEffect(() => {
    if (countryData) {
      const population = countryData?.data.population.filter(
        (item: any) => item.year === data.year,
      );
      setCountryPopulation(population[0]?.population);
    }
  }, [countryData, data.year]);

  const onConfirm = async () => {
    // save data in backend
    setConfirming(true);
    try {
      await addCity({
        name: data.name,
        locode: data.locode,
        area: ocCityData?.area!,
        region: ocCityData?.region!,
        country: ocCityData?.country!,
      })
        .unwrap()
        .then(async (res: any) => {
          await addCityPopulation({
            cityId: res.data.cityId,
            locode: res.data.locode!,
            population: populationData.population,
            countryPopulation: countryPopulation,
            year: populationData.year,
          });
        });
    } catch (err: any) {
      // if the city exists, continue (can still add new inventory year)
      if (err.data?.error?.message !== "Entity exists already.") {
        makeErrorToast("Failed to add city!", err.data?.error?.message);
        setConfirming(false);
        return;
      }
    }

    try {
      await addInventory({
        locode: data.locode,
        year: data.year,
        inventoryName: `${data.name} - ${data.year}`,
      }).unwrap();
      await setUserInfo({
        defaultCityLocode: data.locode,
        defaultInventoryYear: data.year,
      }).unwrap();
      setConfirming(false);
      router.push("/onboarding/done/" + data.locode + "/" + data.year);
    } catch (err: any) {
      console.error("Failed to create new inventory!", err);
      makeErrorToast("Failed to create inventory!", err.data?.error?.message);
      setConfirming(false);
    }
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
              t={t}
            />
          )}
          {activeStep === 1 && (
            <ConfirmStep
              cityName={getValues("city")}
              t={t}
              locode={data.locode}
              area={ocCityData?.area!}
              population={populationData.population}
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
