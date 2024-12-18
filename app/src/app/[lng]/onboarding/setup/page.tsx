"use client";

import { useTranslation } from "@/i18n/client";
import type { CityAttributes } from "@/models/City";
import {
  api,
  useAddCityMutation,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useSetUserInfoMutation,
} from "@/services/api";

import { OCCityAttributes } from "@/util/types";
import { ArrowBackIcon, ArrowForwardIcon } from "@chakra-ui/icons";
import { Box, Button, Text, useSteps, useToast } from "@chakra-ui/react";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import SelectCityStep from "@/components/steps/select-city-steps";
import SetInventoryDetailsStep from "@/components/steps/add-inventory-details-step";
import SetPopulationDataStep from "@/components/steps/add-population-data-step";
import ConfirmStep from "@/components/steps/confirm-city-data-step";
import ProgressSteps from "@/components/steps/progress-steps";

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
  inventoryGoal: string;
  globalWarmingPotential: string;
};

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
    inventoryGoal: "",
    globalWarmingPotential: "",
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

  // Population data

  const cityPopulation = watch("cityPopulation");
  const regionPopulation = watch("regionPopulation");
  const countryPopulation = watch("countryPopulation");
  const cityPopulationYear = watch("cityPopulationYear");
  const regionPopulationYear = watch("regionPopulationYear");
  const countryPopulationYear = watch("countryPopulationYear");

  // Inventory data
  const inventoryGoal = watch("inventoryGoal");
  const globalWarmingPotential = watch("globalWarmingPotential");

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
        year: typeof data.year === "string" ? parseInt(data.year) : data.year,
        inventoryName: `${data.name} - ${data.year}`,
        totalCountryEmissions: getValues("totalCountryEmissions"),
        inventoryType: inventoryGoal,
        globalWarmingPotentialType: globalWarmingPotential,
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
          {t("go-back")}
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
              inventoryGoal={getValues("inventoryGoal")}
              year={getValues("year")}
            />
          )}
        </div>
        <div className="bg-white w-full fixed z-[9999] bottom-0 left-0  pb-8 px-1 transition-all">
          <Box w="full" display="flex" flexDir="column" gap="32px">
            <Box className="w-full">
              <div className="w-full">
                <ProgressSteps steps={steps} currentStep={activeStep} />
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
