"use client";

import { useTranslation } from "@/i18n/client";
import {
  api,
  useAddCityMutation,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useConnectAllInventoryDataSourcesMutation,
  useSetUserInfoMutation,
} from "@/services/api";

import { OCCityAttributes } from "@/util/types";
import { GHGIFormInputs, GHGIOnboardingData } from "@/util/GHGI/types";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";

import { useRouter, useSearchParams } from "next/navigation";
import React, { use, useEffect, useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import SelectCityStep from "@/components/steps/select-city-steps";
import SetInventoryDetailsStep from "@/components/steps/GHGI/set-inventory-details-step";
import SetPopulationDataStep from "@/components/steps/GHGI/set-population-data-step";
import ThirdPartyInventoryDataStep, {
  THIRD_PARTY_DATA_FILL_YES,
} from "@/components/steps/GHGI/set-third-party-step";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";
import ProjectLimitModal from "@/components/project-limit";

type Inputs = { city: string } & GHGIFormInputs;
type OnboardingData = GHGIOnboardingData;

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
    formState: { errors },
  } = useForm<Inputs>();

  const params = useSearchParams();
  const projectId = params.get("project");

  const EnterpriseMode = hasFeatureFlag(FeatureFlags.ENTERPRISE_MODE);

  const { data: projectsList, isLoading } = api.useGetUserProjectsQuery(
    {},
    { skip: !EnterpriseMode },
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
    { title: t("set-third-party-data-step") },
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
  const [connectAllInventoryDataSources] =
    useConnectAllInventoryDataSourcesMutation();
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
  const [createdCityId, setCreatedCityId] = useState<string | null>(null);
  const [isCreatingCity, setIsCreatingCity] = useState(false);

  // Inventory step UI state
  const [selectedYearArray, setSelectedYearArray] = useState<string[]>([]);
  const [selectedInventoryGoalValue, setSelectedInventoryGoalValue] =
    useState("");
  const [
    selectedGlobalWarmingPotentialValue,
    setSelectedGlobalWarmingPotentialValue,
  ] = useState("");
  const [thirdPartyDataChoice, setThirdPartyDataChoice] = useState<
    string | null
  >(null);

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const { data: cityArea } = api.useGetCityBoundaryQuery(
    ocCityData?.actor_id!,
    { skip: !ocCityData?.actor_id },
  );

  // Watched form fields used for per-step validation and confirm payload
  const yearValue = watch("year");
  const cityPopulation = watch("cityPopulation");
  const regionPopulation = watch("regionPopulation");
  const countryPopulation = watch("countryPopulation");
  const cityPopulationYear = watch("cityPopulationYear");
  const regionPopulationYear = watch("regionPopulationYear");
  const countryPopulationYear = watch("countryPopulationYear");
  const inventoryGoal = watch("inventoryGoal");
  const globalWarmingPotential = watch("globalWarmingPotential");

  // A field is "filled" if it is not undefined/null/empty string
  const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "";
  const isInventoryDetailsValid =
    hasValue(yearValue) &&
    hasValue(inventoryGoal) &&
    hasValue(globalWarmingPotential);
  const isPopulationValid = [
    cityPopulation,
    cityPopulationYear,
    regionPopulation,
    regionPopulationYear,
    countryPopulation,
    countryPopulationYear,
  ].every(hasValue);

  const currentYear = new Date().getFullYear();
  const numberOfYearsDisplayed = 20;
  const years = Array.from(
    { length: numberOfYearsDisplayed },
    (_x, i) => currentYear - i,
  );

  // Step 4: create population + inventory, then redirect
  const onInventoryConfirm = async () => {
    if (!createdCityId) return;
    setConfirming(true);

    try {
      await addCityPopulation({
        cityId: createdCityId,
        cityPopulation: cityPopulation!,
        cityPopulationYear: cityPopulationYear!,
        regionPopulation: regionPopulation!,
        regionPopulationYear: regionPopulationYear!,
        countryPopulation: countryPopulation!,
        countryPopulationYear: countryPopulationYear!,
      }).unwrap();
    } catch (err: any) {
      logger.error({ err }, "Onboarding - Failed to add population");
      makeErrorToast(
        t("failed-to-add-city"),
        t(err.data?.error?.message ?? ""),
      );
      setConfirming(false);
      return;
    }

    try {
      const inventory = await addInventory({
        cityId: createdCityId,
        year: typeof data.year === "string" ? parseInt(data.year) : data.year,
        inventoryName: `${data.name} - ${data.year}`,
        totalCountryEmissions: getValues("totalCountryEmissions"),
        inventoryType: inventoryGoal,
        globalWarmingPotentialType: globalWarmingPotential,
      }).unwrap();

      await setUserInfo({
        defaultInventoryId: inventory.inventoryId,
        defaultCityId: createdCityId,
      }).unwrap();

      if (thirdPartyDataChoice === THIRD_PARTY_DATA_FILL_YES) {
        const { errors } = await connectAllInventoryDataSources({
          inventoryId: inventory.inventoryId,
        }).unwrap();
        if (errors.length > 0) {
          logger.warn(
            { errors, inventoryId: inventory.inventoryId },
            "Some third-party sources failed to connect during onboarding",
          );
          makeErrorToast(
            t("connect-data-sources-partial-failure-title"),
            t("connect-data-sources-partial-failure-description"),
          );
        }
      }

      setConfirming(false);
      router.push(
        `/${lng}/cities/${createdCityId}/GHGI/${inventory.inventoryId}`,
      );
    } catch (err: any) {
      logger.error({ err }, "Onboarding - Failed to create inventory");
      makeErrorToast("failed-to-create-inventory", err.data?.error?.message);
      setConfirming(false);
    }
  };

  // Step 0: validate project limit, create city, then advance.
  // Steps 1, 2: merge form data and advance.
  const onSubmit: SubmitHandler<Inputs> = async (formData) => {
    if (activeStep === 0) {
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

      const nextData: OnboardingData = {
        ...data,
        ...formData,
        locode: ocCityData?.actor_id!,
        name: ocCityData?.name!,
      };
      setData(nextData);

      // Create city now (was previously done in the removed confirm step)
      if (!createdCityId) {
        setIsCreatingCity(true);
        const area = cityArea?.area ?? ocCityData?.area ?? undefined;
        const region = ocCityData?.root_path_geo.filter(
          (item: any) => item.type === "adm1",
        )[0];
        const country = ocCityData?.root_path_geo.filter(
          (item: any) => item.type === "country",
        )[0];

        try {
          const city = await addCity({
            name: nextData.name,
            locode: nextData.locode!,
            area: area ? Math.round(area) : undefined,
            region: region?.name ?? undefined,
            country: country?.name ?? undefined,
            regionLocode: region?.actor_id ?? undefined,
            countryLocode: country?.actor_id ?? undefined,
            projectId: EnterpriseMode ? selectedProjectId : undefined,
          }).unwrap();
          setCreatedCityId(city?.cityId ?? null);
        } catch (err: any) {
          logger.error({ err }, "Onboarding - Failed to add city");
          makeErrorToast(
            t("failed-to-add-city"),
            t(err.data?.error?.message ?? ""),
          );
          setIsCreatingCity(false);
          return;
        }
        setIsCreatingCity(false);
      }
    } else {
      setData({ ...data, ...formData });
    }
    goToNextStep();
  };

  // Reset third-party choice when user enters that step
  useEffect(() => {
    if (activeStep === 3) {
      setThirdPartyDataChoice(null);
    }
  }, [activeStep]);

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
              selectedYearArray={selectedYearArray}
              setSelectedYearArray={setSelectedYearArray}
              selectedInventoryGoalValue={selectedInventoryGoalValue}
              selectedGlobalWarmingPotentialValue={
                selectedGlobalWarmingPotentialValue
              }
              setSelectedInventoryGoalValue={setSelectedInventoryGoalValue}
              setSelectedGlobalWarmingPotentialValue={
                setSelectedGlobalWarmingPotentialValue
              }
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
              setValue={setValue}
              watch={watch}
              ocCityData={ocCityData}
            />
          )}
          {activeStep === 3 && (
            <ThirdPartyInventoryDataStep
              t={t}
              cityId={createdCityId!}
              year={
                typeof data.year === "string"
                  ? parseInt(data.year, 10)
                  : data.year
              }
              inventoryType={inventoryGoal}
              value={thirdPartyDataChoice}
              onValueChange={setThirdPartyDataChoice}
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
          data-onboarding-bottom-bar
        >
          <Box w="full" display="flex" flexDir="column" gap="32px">
            <Box w="full">
              <ProgressSteps steps={steps} currentStep={activeStep} />
            </Box>
            <Box w="full" display="flex" justifyContent="end" px="135px">
              {(activeStep === 0 || activeStep === 1 || activeStep === 2) && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleSubmit(onSubmit)}
                  h="64px"
                  type="submit"
                  loading={isCreatingCity}
                  disabled={
                    isCreatingCity ||
                    (activeStep === 0 && !ocCityData) ||
                    (activeStep === 1 && !isInventoryDetailsValid) ||
                    (activeStep === 2 && !isPopulationValid)
                  }
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
              {activeStep === 3 && (
                <Button
                  h={16}
                  w="auto"
                  px="24px"
                  loading={isConfirming}
                  disabled={!thirdPartyDataChoice || isConfirming}
                  onClick={onInventoryConfirm}
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
