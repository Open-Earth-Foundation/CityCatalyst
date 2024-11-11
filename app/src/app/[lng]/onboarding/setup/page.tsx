"use client";

import WizardSteps from "@/components/wizard-steps";
import { useTranslation } from "@/i18n/client";
import type { CityAttributes } from "@/models/City";
import {
  api,
  useAddCityMutation,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useGetOCCityDataQuery,
  useSetUserInfoMutation,
} from "@/services/api";
import {
  findClosestYear,
  getShortenNumberUnit,
  shortenNumber,
} from "@/util/helpers";
import { OCCityAttributes } from "@/util/types";
import {
  ArrowBackIcon,
  ArrowForwardIcon,
  CheckIcon,
  InfoOutlineIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import {
  Box,
  Button,
  Card,
  FormControl,
  FormErrorIcon,
  FormErrorMessage,
  HStack,
  Heading,
  Icon,
  InputGroup,
  InputRightElement,
  Select,
  Text,
  useSteps,
  useToast,
  useRadioGroup,
  useRadio,
  UseRadioProps,
  UseRadioGroupProps,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SubmitHandler, UseFormRegister } from "react-hook-form";
import { useForm } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineAspectRatio, MdOutlinePeopleAlt } from "react-icons/md";

import {
  CalenderIcon,
  DataFormatIcon,
  InventoryButtonCheckIcon,
} from "@/components/icons";
import { CircleFlag } from "react-circle-flags";
import SelectCityStep from "../steps/select-city-steps";
import SetInventoryDetailsStep from "../steps/add-inventory-details-step";
import SetPopulationDataStep from "../steps/add-population-data-step";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

export type Inputs = {
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

export type CountryEmissionsEntry = {
  year: number;
  total_emissions: number;
};

export type OnboardingData = {
  name: string;
  locode: string;
  year: number;
};

// Custom Radio Buttons

interface CustomRadioProps extends UseRadioProps {
  children: React.ReactNode;
}

export function CustomRadio(props: CustomRadioProps) {
  const { getInputProps, getCheckboxProps } = useRadio(props);

  return (
    <Box as="label">
      <input {...getInputProps()} hidden />
      <Box
        {...getCheckboxProps()}
        cursor={props.isDisabled ? "not-allowed" : "pointer"}
        w="181px"
        h="56px"
        borderRadius="full"
        display="flex"
        justifyContent="center"
        alignItems="center"
        fontFamily="heading"
        fontStyle="500"
        textTransform="uppercase"
        lineHeight="20px"
        gap="8px"
        letterSpacing="wide"
        className="transition-all duration-150"
        borderWidth={props.isChecked ? "0" : "1px"}
        borderColor={props.isChecked ? "green.500" : "border.neutral"}
        bg={props.isChecked ? "background.neutral" : "base.light"}
        color={props.isChecked ? "content.link" : "content.secondary"}
        _checked={{
          bg: "background.neutral",
          color: "content.link",
          borderWidth: "1px",
          borderColor: "interactive.secondary",
        }}
        _focus={{
          boxShadow: "outline",
        }}
      >
        {props.isChecked ? <Icon as={InventoryButtonCheckIcon} /> : ""}
        {props.children}
      </Box>
    </Box>
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
  console.log(locode);
  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px">
        <Heading size="lg">{t("confirm-heading")}</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("confirm-description")}
        </Text>
      </Box>
      <Box w="full">
        <Card
          px={6}
          py={8}
          shadow="none"
          bg="none"
          w="full"
          flexDir="row"
          width="full"
          gap="24px"
        >
          <Box w="full" display="flex" flexDir="column">
            <Box display="flex" alignItems="center" gap="16px">
              <CircleFlag
                countryCode={locode?.substring(0, 2).toLowerCase() || ""}
                width={32}
              />
              <Heading
                fontSize="title.md"
                color="content.alternative"
                fontStyle="normal"
                lineHeight="24px"
                textOverflow="ellipsis"
                overflow="hidden"
              >
                {cityName}
              </Heading>
            </Box>
            <Box
              w="full"
              mt={12}
              display="flex"
              flexDir="column"
              justifyContent="space-between"
              gap="24px"
            >
              <Box
                borderBottomWidth="2px"
                borderColor="border.overlay"
                py="36px"
                w="full"
                display="flex"
                justifyContent="space-between"
              >
                <Box
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                  w="full"
                >
                  <Box h="full">
                    <Icon as={CalenderIcon} color="interactive.control" />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                    >
                      2024
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("inventory-year")}
                    </Text>
                  </Box>
                </Box>
                <Box
                  w="full"
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                >
                  <Box h="full">
                    <Icon as={DataFormatIcon} color="interactive.control" />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                    >
                      GPC BASIC
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("inventory-format")}
                    </Text>
                  </Box>
                </Box>
              </Box>
              <Box
                borderBottomWidth="2px"
                borderColor="border.overlay"
                w="full"
                display="flex"
                py="36px"
              >
                <Box
                  w="full"
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                >
                  <Box h="full">
                    <Icon
                      h="24px"
                      w="24px"
                      as={MdOutlinePeopleAlt}
                      color="interactive.control"
                    />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                    >
                      {population ? (
                        <>
                          {shortenNumber(population)}
                          {getShortenNumberUnit(population)}
                        </>
                      ) : (
                        "N/A"
                      )}
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("total-population")}
                    </Text>
                  </Box>
                </Box>
                <Box
                  w="full"
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                >
                  <Box h="full">
                    <Icon
                      as={MdOutlineAspectRatio}
                      color="interactive.control"
                      h="24px"
                      w="24px"
                    />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                    >
                      {area && area > 0 ? (
                        <>
                          {" "}
                          {Math.round(area)}km<sup>2</sup>
                        </>
                      ) : (
                        "N/A"
                      )}
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("total-land-area")}
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
          <Box w="full">
            <CityMap locode={locode} height={400} width={450} />
          </Box>
        </Card>
      </Box>
    </Box>
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
    control,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const steps = [
    { title: t("setup-step") },
    { title: t("set-inventory-details-step") },
    { title: t("set-population-step") },
    { title: t("confirm-step") },
  ];

  const { activeStep, goToNext, goToPrevious } = useSteps({
    index: 0,
    count: steps.length,
  });

  const [addCity] = useAddCityMutation();
  const [addCityPopulation] = useAddCityPopulationMutation();
  const [addInventory] = useAddInventoryMutation();
  const [setUserInfo] = useSetUserInfoMutation();

  const [data, setData] = useState<OnboardingData>({
    name: "",
    locode: "",
    year: -1,
  });
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

  const cityPopulation = watch("cityPopulation");
  const regionPopulation = watch("regionPopulation");
  const countryPopulation = watch("countryPopulation");
  const cityPopulationYear = watch("cityPopulationYear");
  const regionPopulationYear = watch("regionPopulationYear");
  const countryPopulationYear = watch("countryPopulationYear");

  const currentYear = new Date().getFullYear();
  const numberOfYearsDisplayed = 10;
  const years = Array.from(
    { length: numberOfYearsDisplayed },
    (_x, i) => currentYear - i,
  );

  const { data: cityArea, isLoading: isCityAreaLoading } =
    api.useGetCityBoundaryQuery(data.locode!, {
      skip: !data.locode,
    });

  const onConfirm = async () => {
    // save data in backend
    setConfirming(true);
    let city: CityAttributes | null = null;

    const area = cityArea?.area ?? ocCityData?.area ?? undefined;
    const region = ocCityData?.root_path_geo.filter(
      (item: any) => item.type === "adm1",
    )[0];
    const regionName = region?.name ?? "";
    const country = ocCityData?.root_path_geo.filter(
      (item: any) => item.type === "country",
    )[0];
    const countryName = country?.name ?? "";

    try {
      city = await addCity({
        name: data.name,
        locode: data.locode!,
        area: area ? Math.round(area) : undefined,
        region: regionName ?? undefined,
        country: countryName ?? undefined,
        regionLocode: region?.actor_id ?? undefined,
        countryLocode: country?.actor_id ?? undefined,
      }).unwrap();
      await addCityPopulation({
        cityId: city.cityId,
        locode: city.locode!,
        cityPopulation: cityPopulation!,
        cityPopulationYear: cityPopulationYear!,
        regionPopulation: regionPopulation!,
        regionPopulationYear: regionPopulationYear!,
        countryPopulation: countryPopulation!,
        countryPopulationYear: countryPopulationYear!,
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
        totalCountryEmissions: getValues("totalCountryEmissions"),
      }).unwrap();
      await setUserInfo({
        cityId: city?.cityId!,
        defaultInventoryId: inventory.inventoryId,
      }).unwrap();
      setConfirming(false);
      router.push(
        "/onboarding/done/" +
          data.locode +
          "/" +
          data.year +
          "/" +
          inventory.inventoryId,
      );
    } catch (err: any) {
      console.error("Failed to create new inventory!", err);
      makeErrorToast("Failed to create inventory!", err.data?.error?.message);
      setConfirming(false);
    }
  };

  const onSubmit: SubmitHandler<Inputs> = async (formData) => {
    setData({
      ...data,
      ...formData,
      locode: ocCityData?.actor_id!,
      name: ocCityData?.name!,
    });
    goToNext();
    console.log(data);
  };

  return (
    <>
      <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto">
        <Button
          variant="ghost"
          leftIcon={<ArrowBackIcon boxSize={6} />}
          onClick={() => {
            activeStep === 0 ? router.back() : goToPrevious();
          }}
          pl={0}
        >
          Go Back
        </Button>
        <div className="flex flex-col md:flex-row md:space-x-12 md:space-y-0 space-y-12 align-top mt-8 md:mt-16 mb-48">
          {activeStep === 0 && (
            <SelectCityStep
              errors={errors}
              setValue={setValue}
              register={register}
              watch={watch}
              ocCityData={ocCityData}
              setOcCityData={setOcCityData}
              setData={setData}
              control={control}
              t={t}
            />
          )}
          {activeStep === 1 && (
            <SetInventoryDetailsStep
              t={t}
              register={register}
              errors={errors}
              control={control}
              setValue={setValue}
              years={years}
            />
          )}
          {activeStep === 2 && (
            <SetPopulationDataStep
              t={t}
              register={register}
              control={control}
              errors={errors}
              years={years}
              numberOfYearsDisplayed={numberOfYearsDisplayed}
              setData={setData}
              setOcCityData={setOcCityData}
              setValue={setValue}
              watch={watch}
              ocCityData={ocCityData}
            />
          )}
          {activeStep === 3 && (
            <ConfirmStep
              cityName={getValues("city")}
              t={t}
              locode={data.locode}
              area={cityArea?.area!}
              population={cityPopulation}
            />
          )}
        </div>
        <div className="bg-white w-full fixed z-[9999] bottom-0 left-0  pb-8 px-1 transition-all">
          <Box w="full" display="flex" flexDir="column" gap="32px">
            <Box className="w-full">
              <div className="w-full">
                <WizardSteps steps={steps} currentStep={activeStep} />
              </div>
            </Box>
            <Box w="full" display="flex" justifyContent="end" px="135px">
              {activeStep == 0 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleSubmit(onSubmit)}
                  h="64px"
                  type="submit"
                  rightIcon={<ArrowForwardIcon h="24px" w="24px" />}
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                </Button>
              )}
              {activeStep == 1 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  onClick={handleSubmit(onSubmit)}
                  px="24px"
                  h="64px"
                  rightIcon={<ArrowForwardIcon h="24px" w="24px" />}
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                </Button>
              )}
              {activeStep == 2 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  onClick={handleSubmit(onSubmit)}
                  px="24px"
                  h="64px"
                  rightIcon={<ArrowForwardIcon h="24px" w="24px" />}
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                </Button>
              )}
              {activeStep == 3 && (
                <Button
                  h={16}
                  w="auto"
                  isLoading={isConfirming}
                  px="24px"
                  onClick={onConfirm}
                  rightIcon={<ArrowForwardIcon h="24px" w="24px" />}
                >
                  {t("continue")}
                </Button>
              )}
            </Box>
          </Box>
        </div>
      </div>
    </>
  );
}
