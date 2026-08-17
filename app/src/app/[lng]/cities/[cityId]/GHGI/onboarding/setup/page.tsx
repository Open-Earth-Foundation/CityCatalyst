"use client";

import { useTranslation } from "@/i18n/client";
import type { GHGIFormInputs, GHGIOnboardingData } from "@/util/GHGI/types";
import {
  api,
  useAddCityPopulationMutation,
  useAddInventoryMutation,
  useConnectAllInventoryDataSourcesMutation,
  useSetUserInfoMutation,
} from "@/services/api";

import { OCCityAttributes } from "@/util/types";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";

import { useRouter, useSearchParams } from "next/navigation";
import React, { use, useEffect, useMemo, useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import SetInventoryDetailsStep from "@/components/steps/GHGI/set-inventory-details-step";
import SetPopulationDataStep from "@/components/steps/GHGI/set-population-data-step";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";
import ProjectLimitModal from "@/components/project-limit";
import { useGetCityQuery } from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import ThirdPartyInventoryDataStep, {
  THIRD_PARTY_DATA_FILL_YES,
} from "@/components/steps/GHGI/set-third-party-step";
import GhgiImportWizard from "@/components/steps/GHGI/import/ghgi-import-wizard";

type Inputs = GHGIFormInputs;
type OnboardingData = GHGIOnboardingData;

export default function OnboardingSetup(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const { t: tDrawer } = useTranslation(lng, "data");
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
  const isUploadMode = params.get("mode") === "upload";

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

  // Create: details → population → third-party (3).
  // Upload: details → population → upload → mapping → review (5, no third-party).
  const steps = useMemo(
    () =>
      isUploadMode
        ? [
            { title: t("set-inventory-details-step") },
            { title: t("set-population-step") },
            { title: t("upload-file-step") },
            { title: t("inventory-mapping-step") },
            { title: t("review-confirm-step") },
          ]
        : [
            { title: t("set-inventory-details-step") },
            { title: t("set-population-step") },
            { title: t("set-third-party-data-step") },
          ],
    [isUploadMode, t],
  );

  const {
    value: activeStep,
    goToNextStep,
    goToPrevStep,
    setStep,
  } = useSteps({
    defaultStep: 0,
    count: steps.length,
  });

  // Inventory created mid-flow in upload mode; import steps reuse this id.
  const [createdInventoryId, setCreatedInventoryId] = useState<string | null>(
    null,
  );

  // Keep the viewport at the top when the stepper advances (CC-617).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

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

  const { data: CCCityData } = useGetCityQuery(cityId, {
    skip: !cityId,
  });
  const { data: userInfo } = api.useGetUserInfoQuery();

  // Fetch existing inventories for this city to check for duplicate years
  const { data: existingInventories } = api.useGetInventoriesQuery(
    { cityId },
    { skip: !cityId },
  );

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

  // Inventory details step state
  const [selectedYearArray, setSelectedYearArray] = useState<string[]>([]);
  const [selectedInventoryGoalValue, setSelectedInventoryGoalValue] =
    useState("");
  const [
    selectedGlobalWarmingPotentialValue,
    setSelectedGlobalWarmingPotentialValue,
  ] = useState("");

  // Check if the selected year already has an inventory
  const selectedYear =
    selectedYearArray.length > 0 ? parseInt(selectedYearArray[0], 10) : null;
  const yearAlreadyExists = useMemo(() => {
    if (!selectedYear || !existingInventories) return false;
    return existingInventories.some((inv) => inv.year === selectedYear);
  }, [selectedYear, existingInventories]);
  const [thirdPartyDataChoice, setThirdPartyDataChoice] = useState<
    string | null
  >(null);

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  // Show error toast when user selects a year that already has an inventory
  useEffect(() => {
    if (yearAlreadyExists && selectedYear) {
      makeErrorToast(
        t("inventory-year-already-exists-title"),
        t("inventory-year-already-exists-description", { year: selectedYear }),
      );
    }
  }, [yearAlreadyExists, selectedYear]);

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
    } catch (err: unknown) {
      logger.error({ err }, "Onboarding - Failed to add city or population");
      const errorData = isFetchBaseQueryError(err)
        ? (err.data as { error?: { message?: string } })
        : undefined;
      makeErrorToast(
        t("failed-to-add-city"),
        t(errorData?.error?.message ?? ""),
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

      if (thirdPartyDataChoice === THIRD_PARTY_DATA_FILL_YES) {
        const { errors } = await connectAllInventoryDataSources({
          inventoryId: inventory.inventoryId,
        }).unwrap();
        if (errors.length > 0) {
          logger.warn(
            { errors, inventoryId: inventory.inventoryId },
            "Some third-party sources failed to connect during onboarding",
          );
        }
      }

      setConfirming(false);

      if (isUploadMode) {
        // Stay on setup: jump to import steps with a continuous 5-step ProgressSteps.
        setCreatedInventoryId(inventory.inventoryId);
        setStep(2);
      } else {
        router.push(`/${lng}/cities/${cityId}/GHGI/${inventory.inventoryId}`);
      }
    } catch (err: unknown) {
      logger.error({ err: err }, "Failed to create new inventory!");
      const errorData = isFetchBaseQueryError(err)
        ? (err.data as { error?: { message?: string } })
        : undefined;
      makeErrorToast("failed-to-create-inventory", errorData?.error?.message);
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

  // Reset third-party choice each time the user enters that step
  useEffect(() => {
    if (!isUploadMode && activeStep === 2) {
      setThirdPartyDataChoice(null);
    }
  }, [activeStep, isUploadMode]);

  // Tracked but never read/sent to addInventory yet — looks like unfinished
  // wiring rather than dead code, left as-is pending a follow-up ticket.
  const [_selectedProject, setSelectedProject] = useState<string[]>([]);
  useEffect(() => {
    if (projectId) {
      setSelectedProject([projectId!]);
    }
  }, [projectId]);

  if (isProjectsLoading || isCityLoading) {
    return <ProgressLoader />;
  }

  // Upload mode after inventory create: same wizard, continuous 5-step ProgressSteps.
  if (isUploadMode && createdInventoryId && activeStep >= 2) {
    return (
      <GhgiImportWizard
        lng={lng}
        cityId={cityId}
        inventoryId={createdInventoryId}
        progressSteps={steps}
        progressStepOffset={2}
        onExitFirstStep={() => setStep(1)}
        onComplete={(id) => {
          router.push(`/${lng}/cities/${cityId}/GHGI/${id}`);
        }}
      />
    );
  }

  return (
    <>
      <Box pt={16} pb={16} maxW="full" mx="auto" w="1090px">
        <Button
          variant="ghost"
          onClick={() => {
            if (activeStep === 0) {
              router.back();
            } else {
              goToPrevStep();
            }
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
          {activeStep === 1 && (
            <SetPopulationDataStep
              t={t}
              control={control}
              errors={errors}
              years={years}
              numberOfYearsDisplayed={numberOfYearsDisplayed}
              setData={setData}
              setValue={setValue}
              watch={watch}
              ocCityData={ocCityData}
              numberFormat={userInfo?.numberFormat}
            />
          )}
          {!isUploadMode && activeStep === 2 && (
            <ThirdPartyInventoryDataStep
              t={t}
              tDrawer={tDrawer}
              cityId={cityId}
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
          transition="all"
          data-onboarding-bottom-bar
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
                  onClick={
                    isUploadMode ? onConfirm : handleSubmit(onSubmit)
                  }
                  px="24px"
                  h="64px"
                  loading={isUploadMode && isConfirming}
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
              {!isUploadMode && activeStep == 2 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  onClick={onConfirm}
                  px="24px"
                  h="64px"
                  disabled={!thirdPartyDataChoice}
                  loading={isConfirming}
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("create-inventory")}
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
