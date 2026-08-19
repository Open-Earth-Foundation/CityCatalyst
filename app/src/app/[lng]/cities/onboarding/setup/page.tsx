"use client";

import { useTranslation } from "@/i18n/client";
import {
  api,
  useAddCityMutation,
  useAddCityPopulationMutation,
} from "@/services/api";

import { OCCityAttributes } from "@/util/types";
import { GHGIFormInputs, GHGIOnboardingData } from "@/util/GHGI/types";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";

import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import type {
  Control,
  FieldErrors,
  SubmitHandler,
  UseFormSetValue,
} from "react-hook-form";
import { useForm } from "react-hook-form";
import SelectCityStep from "@/components/steps/select-city-steps";
import SetPopulationDataStep from "@/components/steps/GHGI/set-population-data-step";
import InviteCollaboratorsStep, {
  type InviteCollaboratorsStepRef,
} from "@/components/steps/GHGI/invite-collaborators-step";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";
import { isFetchBaseQueryError } from "@/util/helpers";
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

  const { data: userInfo } = api.useGetUserInfoQuery();

  useEffect(() => {
    if (projectsList && projectsList.length > 0) {
      setSelectedProject([projectsList[0].projectId]);
    }
  }, [projectsList]);

  const steps = [
    { title: t("setup-step") },
    { title: t("set-population-step") },
    { title: t("invite-collaborators-step") },
  ];

  const inviteCollaboratorsStepIndex = 2;

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

  const [data, setData] = useState<OnboardingData>({
    name: "",
    locode: "",
    year: -1,
    inventoryGoal: "",
    globalWarmingPotential: "",
  });
  const [ocCityData, setOcCityData] = useState<OCCityAttributes>();
  const [isProjectLimitModalOpen, setIsProjectLimitModalOpen] = useState(false);
  const [createdCityId, setCreatedCityId] = useState<string | null>(null);
  const [isSubmittingStep, setIsSubmittingStep] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  // Continue on the invite step requires project + email(s) + city (CC-652).
  const [canSubmitInvite, setCanSubmitInvite] = useState(false);

  const inviteStepRef = useRef<InviteCollaboratorsStepRef>(null);

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const { data: cityArea } = api.useGetCityBoundaryQuery(
    ocCityData?.actor_id ?? "",
    { skip: !ocCityData?.actor_id },
  );

  // Watched form fields used for per-step validation and population payload
  const cityPopulation = watch("cityPopulation");
  const regionPopulation = watch("regionPopulation");
  const countryPopulation = watch("countryPopulation");
  const cityPopulationYear = watch("cityPopulationYear");
  const regionPopulationYear = watch("regionPopulationYear");
  const countryPopulationYear = watch("countryPopulationYear");

  // A field is "filled" if it is not undefined/null/empty string
  const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "";
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

  // Final step: send invites (if any) and finish onboarding. The user's
  // default city is already set server-side when the city is created.
  // Inventory creation happens separately, outside onboarding.
  const finishOnboarding = async () => {
    setIsFinishing(true);
    const doneParams = new URLSearchParams();
    if (projectId) doneParams.set("project", projectId);
    if (createdCityId) doneParams.set("cityId", createdCityId);
    router.push(`/${lng}/cities/onboarding/done?${doneParams.toString()}`);
    setIsFinishing(false);
  };

  // Step 0: validate project limit, create city, then advance.
  // Step 1: persist population data, then advance.
  const onSubmit: SubmitHandler<Inputs> = async (formData) => {
    if (activeStep === 0) {
      // Guaranteed by the disabled state of the submit button, which requires ocCityData.
      if (!ocCityData) return;

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
        locode: ocCityData.actor_id,
        name: ocCityData.name,
      };
      setData(nextData);

      // Create city now (was previously done in the removed confirm step)
      if (!createdCityId) {
        setIsSubmittingStep(true);
        const area = cityArea?.area ?? ocCityData?.area ?? undefined;
        const region = ocCityData?.root_path_geo.filter(
          (item) => item.type === "adm1",
        )[0];
        const country = ocCityData?.root_path_geo.filter(
          (item) => item.type === "country",
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
        } catch (err: unknown) {
          logger.error({ err }, "Onboarding - Failed to add city");
          const errorData = isFetchBaseQueryError(err)
            ? (err.data as { error?: { message?: string } })
            : undefined;
          makeErrorToast(
            t("failed-to-add-city"),
            t(errorData?.error?.message ?? ""),
          );
          setIsSubmittingStep(false);
          return;
        }
        setIsSubmittingStep(false);
      }
    } else if (activeStep === 1) {
      if (!createdCityId) return;
      setIsSubmittingStep(true);
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
        setData({ ...data, ...formData });
      } catch (err: any) {
        logger.error({ err }, "Onboarding - Failed to add population");
        makeErrorToast(
          t("failed-to-add-city"),
          t(err.data?.error?.message ?? ""),
        );
        setIsSubmittingStep(false);
        return;
      }
      setIsSubmittingStep(false);
    }
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
            <SetPopulationDataStep
              t={t}
              control={control as unknown as Control<GHGIFormInputs>}
              errors={errors as unknown as FieldErrors<GHGIFormInputs>}
              years={years}
              numberOfYearsDisplayed={numberOfYearsDisplayed}
              setData={setData}
              setValue={setValue as unknown as UseFormSetValue<GHGIFormInputs>}
              watch={watch}
              ocCityData={ocCityData}
              numberFormat={userInfo?.numberFormat}
            />
          )}
          {activeStep === inviteCollaboratorsStepIndex && (
            <InviteCollaboratorsStep
              ref={inviteStepRef}
              lng={lng}
              onValidityChange={setCanSubmitInvite}
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
              <ProgressSteps steps={steps} currentStep={activeStep} />
            </Box>
            <Box w="full" display="flex" justifyContent="end" px="135px">
              {(activeStep === 0 || activeStep === 1) && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleSubmit(onSubmit)}
                  h="64px"
                  type="submit"
                  loading={isSubmittingStep}
                  disabled={
                    isSubmittingStep ||
                    (activeStep === 0 && !ocCityData) ||
                    (activeStep === 1 && !isPopulationValid)
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
              {activeStep === inviteCollaboratorsStepIndex && (
                <Box display="flex" gap="16px">
                  <Button
                    w="auto"
                    gap="8px"
                    py="16px"
                    px="24px"
                    h="64px"
                    variant="ghost"
                    color="content.link"
                    loading={isFinishing}
                    onClick={finishOnboarding}
                  >
                    <Text
                      fontFamily="button.md"
                      fontWeight="600"
                      letterSpacing="wider"
                    >
                      {t("skip-this-step")}
                    </Text>
                  </Button>
                  <Button
                    w="auto"
                    gap="8px"
                    py="16px"
                    px="24px"
                    h="64px"
                    loading={isFinishing}
                    disabled={!canSubmitInvite || isFinishing}
                    onClick={async () => {
                      try {
                        await inviteStepRef.current?.sendInvites();
                      } catch {
                        makeErrorToast(t("invite-failed"));
                      }
                      await finishOnboarding();
                    }}
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
                </Box>
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
