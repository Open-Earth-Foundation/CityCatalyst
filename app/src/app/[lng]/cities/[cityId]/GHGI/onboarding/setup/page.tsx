"use client";

import { useTranslation } from "@/i18n/client";
import type { GHGIFormInputs, GHGIOnboardingData } from "@/util/GHGI/types";
import {
  api,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useSetUserInfoMutation,
} from "@/services/api";

import { OCCityAttributes } from "@/util/types";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";

import { useRouter, useSearchParams } from "next/navigation";
import React, { use, useEffect, useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import SetInventoryDetailsStep from "@/components/steps/GHGI/set-inventory-details-step";
import SetPopulationDataStep from "@/components/steps/add-population-data-step";
import ConfirmStep from "@/components/steps/GHGI/confirm-inventory-data-step";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";
import ProjectLimitModal from "@/components/project-limit";
import { useGetCityQuery } from "@/services/api";

type Inputs = GHGIFormInputs;
type OnboardingData = GHGIOnboardingData;

export default function OnboardingSetup(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();

  const {
    handleSubmit,
    register,
    getValues,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const params = useSearchParams();

  const projectId = params.get("project");

  const EnterpriseMode = hasFeatureFlag(FeatureFlags.ENTERPRISE_MODE);

  const { data: projectsList, isLoading: isProjectsLoading } =
    api.useGetUserProjectsQuery(
      {},
      {
        skip: !EnterpriseMode,
      },
    );

  // Fetch city data using the cityId from URL
  const { data: cityData, isLoading: isCityLoading } = api.useGetCityQuery(
    cityId,
    {
      skip: !cityId,
    },
  );

  useEffect(() => {
    if (projectsList && projectsList.length > 0) {
      setSelectedProject([projectsList[0].projectId]);
    }
  }, [projectsList]);

  // Populate data state with city information when city data is loaded
  useEffect(() => {
    if (cityData) {
      setData((prevData) => ({
        ...prevData,
        name: cityData.name || "",
        locode: cityData.locode || "",
      }));
    }
  }, [cityData]);

  const steps = [
    { title: t("set-inventory-details-step") },
    { title: t("set-population-step") },
    { title: t("confirm-step") },
  ];

  const {
    value: activeStep,
    goToNextStep,
    goToPrevStep,
  } = useSteps({
    defaultStep: 0,
    count: steps.length,
  });

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
  const [isProjectLimitModalOpen, setIsProjectLimitModalOpen] = useState(false);

  const { data: CCCityData } = useGetCityQuery(cityId, {
    skip: !cityId,
  });

  useEffect(() => {
    if (CCCityData) {
      setOcCityData({
        actor_id: CCCityData.locode?.split("-").join(" ") as string,
        name: CCCityData.name as string,
        is_part_of: CCCityData.regionLocode as string,
        root_path_geo: [],
        area: 0,
      });
    }
  }, [CCCityData, setValue, setOcCityData]);

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
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
  const numberOfYearsDisplayed = 20;
  const years = Array.from(
    { length: numberOfYearsDisplayed },
    (_x, i) => currentYear - i,
  );

  const onConfirm = async () => {
    setConfirming(true);

    const projectId =
      selectedProject?.length > 0 ? selectedProject[0] : undefined;

    try {
      // Log population data before sending
      const populationData = {
        cityId: cityId,
        cityPopulation: cityPopulation!,
        cityPopulationYear: cityPopulationYear!,
        regionPopulation: regionPopulation!,
        regionPopulationYear: regionPopulationYear!,
        countryPopulation: countryPopulation!,
        countryPopulationYear: countryPopulationYear!,
      };

      logger.info({ populationData }, "Onboarding - Sending population data");

      await addCityPopulation(populationData).unwrap();
    } catch (err: any) {
      logger.error({ err }, "Onboarding - Failed to add city or population");
      makeErrorToast(
        t("failed-to-add-city"),
        t(err.data?.error?.message ?? ""),
      );
      setConfirming(false);
      return;
    }

    try {
      const inventory = await addInventory({
        cityId,
        year: typeof data.year === "string" ? parseInt(data.year) : data.year,
        inventoryName: `${data.name} - ${data.year}`,
        totalCountryEmissions: getValues("totalCountryEmissions"),
        inventoryType: inventoryGoal,
        globalWarmingPotentialType: globalWarmingPotential,
      }).unwrap();
      await setUserInfo({
        defaultInventoryId: inventory.inventoryId,
        defaultCityId: cityId,
      }).unwrap();
      setConfirming(false);
      router.push(`/${lng}/cities/${cityId}/GHGI/${inventory.inventoryId}`);
    } catch (err: any) {
      logger.error({ err: err }, "Failed to create new inventory!");
      makeErrorToast("failed-to-create-inventory", err.data?.error?.message);
      setConfirming(false);
    }
  };

  const onSubmit: SubmitHandler<Inputs> = async (formData) => {
    setData({
      ...data,
      ...formData,
      locode: cityData?.locode || "",
      name: cityData?.name || "",
    });
    goToNextStep();
  };

  const [selectedProject, setSelectedProject] = useState<string[]>([]);
  useEffect(() => {
    if (projectId) {
      setSelectedProject([projectId!]);
    }
  }, [projectId]);

  if (isProjectsLoading || isCityLoading) {
    return <ProgressLoader />;
  }

  return (
    <>
      <Box pt={16} pb={16} maxW="full" mx="auto" w="1090px">
        <Button
          variant="ghost"
          onClick={() => {
            activeStep === 0 ? router.back() : goToPrevStep();
          }}
          pl={0}
          color="content.link"
        >
          <Icon as={MdArrowBack} boxSize={6} />
          {t("go-back")}
        </Button>
        <Box
          display="flex"
          flexDirection={{ base: "column", md: "row" }}
          columnGap={{ md: "48px" }}
          rowGap={{ base: "48px", md: "0px" }}
          alignItems="flex-start"
          mt={{ base: 8, md: 16 }}
          mb={48}
          w={"1090px"}
          mx="auto"
        >
          {activeStep === 0 && (
            <SetInventoryDetailsStep
              t={t}
              register={register}
              errors={errors}
              control={control}
              setValue={setValue}
              years={years}
            />
          )}
          {activeStep === 1 && (
            <SetPopulationDataStep
              t={t}
              register={register}
              control={control}
              errors={errors}
              years={years}
              numberOfYearsDisplayed={numberOfYearsDisplayed}
              setData={setData}
              setValue={setValue}
              watch={watch}
              ocCityData={ocCityData}
            />
          )}
          {activeStep === 2 && (
            <ConfirmStep
              cityName={data.name}
              t={t}
              locode={data.locode}
              population={
                typeof cityPopulation === "string"
                  ? parseInt(cityPopulation as string)
                  : cityPopulation
              }
              inventoryGoal={inventoryGoal}
              year={data.year}
            />
          )}
        </Box>
        <Box
          bg="white"
          w="full"
          position="fixed"
          bottom={0}
          left={0}
          pb={8}
          px={1}
          zIndex={9999}
          transition="all"
        >
          <Box w="full" display="flex" flexDir="column" gap="32px">
            <Box w="full">
              <Box w="full">
                <ProgressSteps steps={steps} currentStep={activeStep} />
              </Box>
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
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
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
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
              {activeStep == 2 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  onClick={onConfirm}
                  px="24px"
                  h="64px"
                  loading={isConfirming}
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      <ProjectLimitModal
        isOpen={isProjectLimitModalOpen}
        onClose={() => setIsProjectLimitModalOpen(false)}
        lng={lng}
        onOpenChange={setIsProjectLimitModalOpen}
      />
    </>
  );
}
