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
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";

import { useRouter, useSearchParams } from "next/navigation";
import React, { use, useEffect, useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import SelectCityStep from "@/components/steps/select-city-steps";
import SetInventoryDetailsStep from "@/components/steps/add-inventory-details-step";
import SetPopulationDataStep from "@/components/steps/add-population-data-step";
import ConfirmStep from "@/components/steps/confirm-city-data-step";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";
import ProjectLimitModal from "@/components/project-limit";

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

export default function OnboardingSetup(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
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

  const { data: projectsList, isLoading } = api.useGetUserProjectsQuery(
    {},
    {
      skip: !EnterpriseMode,
    },
  );

  useEffect(() => {
    if (projectsList && projectsList.length > 0) {
      setSelectedProject([projectsList[0].projectId]);
    }
  }, [projectsList]);

  const steps = [
    { title: t("setup-step") },
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
  const [isProjectLimitModalOpen, setIsProjectLimitModalOpen] = useState(false);

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

    const projectId =
      selectedProject?.length > 0 ? selectedProject[0] : undefined;

    try {
      city = await addCity({
        name: data.name,
        locode: data.locode!,
        area: area ? Math.round(area) : undefined,
        region: regionName ?? undefined,
        country: countryName ?? undefined,
        regionLocode: region?.actor_id ?? undefined,
        countryLocode: country?.actor_id ?? undefined,
        projectId: EnterpriseMode ? projectId : undefined,
      }).unwrap();

      // Log population data before sending
      const populationData = {
        cityId: city.cityId,
        locode: city.locode!,
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
        `/onboarding/done/${data.locode}/${data.year}/${inventory.inventoryId}?project=${projectId}`,
      );
    } catch (err: any) {
      logger.error({ err: err }, "Failed to create new inventory!");
      makeErrorToast("failed-to-create-inventory", err.data?.error?.message);
      setConfirming(false);
    }
  };

  const onSubmit: SubmitHandler<Inputs> = async (formData) => {
    const selectedProjectId =
      selectedProject.length > 0 ? selectedProject[0] : undefined;

    if (EnterpriseMode && selectedProjectId) {
      const project = projectsList?.find(
        (proj) => proj.projectId === selectedProjectId,
      );
      const isCityAlreadyAdded = project?.cities.some(
        (city) =>
          city.name === formData.city && city.locode === ocCityData?.actor_id,
      );
      if (
        Number(project?.cities.length) >=
          Number(project?.cityCountLimit as unknown as string) &&
        !isCityAlreadyAdded
      ) {
        setIsProjectLimitModalOpen(true);
        return;
      }
    }

    setData({
      ...data,
      ...formData,
      locode: ocCityData?.actor_id!,
      name: ocCityData?.name!,
    });
    goToNextStep();
  };

  const [selectedProject, setSelectedProject] = useState<string[]>([]);
  useEffect(() => {
    if (projectId) {
      setSelectedProject([projectId!]);
    }
  }, [projectId]);

  if (isLoading) {
    return <ProgressLoader />;
  }

  return (
    <>
      <Box pt={16} pb={16} maxW="full" mx="auto">
        <Button
          variant="ghost"
          onClick={() => {
            activeStep === 0 ? router.back() : goToPrevStep();
          }}
          pl={0}
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
            <SelectCityStep
              errors={errors}
              setValue={setValue}
              register={register}
              watch={watch}
              ocCityData={ocCityData}
              setOcCityData={setOcCityData}
              setData={setData}
              control={control}
              projectsList={projectsList}
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
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
              {activeStep == 3 && (
                <Button
                  h={16}
                  w="auto"
                  loading={isConfirming}
                  px="24px"
                  onClick={onConfirm}
                >
                  {t("continue")}
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
