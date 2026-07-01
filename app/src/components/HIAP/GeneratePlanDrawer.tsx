import React, { useState } from "react";
import {
  Box,
  Button,
  Drawer,
  Icon,
  Portal,
  Text,
  HStack,
  VStack,
  Spinner,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { CloseButton } from "@/components/ui/close-button";
import { GeneratePlanIcon } from "@/components/icons";
import { RiFile3Line } from "react-icons/ri";
import { GoLocation } from "react-icons/go";
import { CityWithProjectDataResponse, HIAction } from "@/util/types";
import { useGenerateActionPlanMutation } from "@/services/api";
import { TitleLarge } from "@/components/package/Texts/Title";
import { BodyLarge } from "@/components/package/Texts/Body";
import { HeadlineMedium } from "@/components/package/Texts/Headline";
import { useActionPlan } from "@/hooks/use-action-plan";
import { PDFExportService } from "@/services/PDFExportService";
import { toaster } from "@/components/ui/toaster";

export const GeneratePlanDrawer = ({
  t,
  action,
  cityData,
  cityLocode,
  cityId,
  inventoryId,
}: {
  t: TFunction;
  action: HIAction;
  cityData?: CityWithProjectDataResponse;
  cityLocode?: string;
  cityId?: string;
  inventoryId?: string;
}) => {
  const [generateActionPlan, { isLoading, error }] =
    useGenerateActionPlanMutation();
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Check if an action plan already exists
  const {
    data: existingPlan,
    isLoading: isPlanLoading,
    refetch: refetchPlan,
  } = useActionPlan({
    actionId: action.actionId,
    cityId: cityData?.cityId || "",
    language: action.lang || "en",
  });

  const planToDisplay = existingPlan?.planData;
  const hasExistingPlan = !!existingPlan;

  const handleGeneratePlan = async () => {
    if (!cityData?.cityId || !cityLocode) {
      console.error("Missing required data for plan generation:");
      return;
    }

    try {
      // Start the plan generation process
      generateActionPlan({
        action: action,
        cityId: cityData?.cityId || "",
        inventoryId: inventoryId || "",
        cityLocode: cityLocode,
        lng: action.lang,
        rankingId: action.hiaRankingId,
      });

      // Show immediate toast notification that generation has started
      toaster.create({
        title: t("plan-generation-started"),
        description: t("plan-generation-started-description"),
        type: "info",
        duration: 5000,
      });

      // Note: Plan generation happens in the background
      // User will be notified via email when it's complete
    } catch (error) {
      console.error("Failed to start plan generation:", error);
      toaster.create({
        title: t("plan-generation-failed"),
        description: t("plan-generation-failed-description"),
        type: "error",
        duration: 5000,
      });
    }
  };

  const handleExportPDF = async () => {
    if (!planToDisplay) {
      console.error("No plan data available for PDF export");
      return;
    }

    setIsPdfGenerating(true);

    try {
      const cityName =
        planToDisplay.metadata?.cityName || cityLocode || "Unknown City";
      const actionTitle = planToDisplay.metadata?.actionName || action.name;

      // Generate PDF using frontend jsPDF service
      PDFExportService.generateActionPlanPDF(
        planToDisplay,
        actionTitle,
        cityName,
        t,
      );
    } catch (error) {
      console.error("Failed to export PDF:", error);
      // You could add a toast notification here for better UX
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // Show loading spinner while checking for existing plan
  if (isPlanLoading) {
    return (
      <Button
        color="content.link"
        w="full"
        borderWidth="1px"
        borderColor="content.link"
        borderRadius="sm"
        bg="transparent"
        disabled
      >
        <Spinner size="sm" color="content.link" />
        {t("loading")}
      </Button>
    );
  }

  // If plan is being generated, show loading state
  if (isLoading) {
    return (
      <Button
        color="content.link"
        w="full"
        borderWidth="1px"
        borderColor="content.link"
        borderRadius="sm"
        bg="transparent"
        disabled
      >
        <Spinner size="sm" color="content.link" />
        {t("generating-plan")}
      </Button>
    );
  }

  // If no existing plan, show generate button that starts generation immediately
  if (!hasExistingPlan) {
    return (
      <Button
        color="content.link"
        w="full"
        borderWidth="1px"
        borderColor="content.link"
        borderRadius="sm"
        className="group"
        bg="transparent"
        onClick={handleGeneratePlan}
        disabled={!cityData?.cityId || !cityLocode}
      >
        <Icon as={GeneratePlanIcon} color="content.link" />
        {!cityData?.cityId || !cityLocode
          ? t("missing-data")
          : t("generate-plan")}
      </Button>
    );
  }

  // If existing plan, show view button that opens drawer
  return (
    <Drawer.Root size="lg">
      <Drawer.Trigger asChild>
        <Button
          color="content.link"
          w="full"
          borderWidth="1px"
          borderColor="content.link"
          borderRadius="sm"
          className="group"
          bg="transparent"
        >
          <Icon as={GeneratePlanIcon} color="content.link" />
          {t("view-generated-plan")}
        </Button>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content h="100vh" p="24px">
            <Drawer.Header
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap="16px"
              pb="16px"
              borderBottom="1px solid"
              borderColor="border.overlay"
            >
              <Drawer.Title
                fontFamily="heading"
                fontWeight="bold"
                fontSize="title.lg"
                color="content.primary"
              >
                {t("generated-action-plan")}
              </Drawer.Title>
              <HStack gap="12px">
                <Button
                  variant="ghost"
                  color="content.tertiary"
                  px="4px"
                  h="40px"
                  onClick={handleExportPDF}
                  disabled={!planToDisplay || isPdfGenerating}
                  loading={isPdfGenerating}
                >
                  <Icon as={RiFile3Line} boxSize="24px" />
                  {isPdfGenerating ? t("generating-pdf") : t("export-as-pdf")}
                </Button>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Drawer.CloseTrigger>
              </HStack>
            </Drawer.Header>
            <Drawer.Body overflowY="auto" pt="24px">
              <VStack alignItems="flex-start" gap="24px" w="full">
                {planToDisplay && (
                  <>
                    <HeadlineMedium
                      fontWeight="bold"
                      color="content.primary"
                      pb="12px"
                      textTransform="capitalize"
                    >
                      {action.name} - {t("implementation-plan")}
                    </HeadlineMedium>

                    {/* Introduction */}
                    <Box w="full">
                      <Box
                        w="full"
                        display="flex"
                        alignItems="center"
                        gap="8px"
                        pb="24px"
                        mb="24px"
                        borderBottom="1px solid"
                        borderColor="border.overlay"
                      >
                        <Icon
                          as={GoLocation}
                          color="content.link"
                          boxSize="24px"
                        />
                        <TitleLarge fontWeight="bold" color="content.secondary">
                          {planToDisplay.metadata?.cityName}
                        </TitleLarge>
                      </Box>

                      <BodyLarge color="content.secondary" mb="16px">
                        {
                          planToDisplay.content?.introduction
                            ?.action_description
                        }
                      </BodyLarge>
                    </Box>

                    {/* Subactions */}
                    {planToDisplay.content?.subactions?.items && (
                      <Box w="full">
                        <TitleLarge
                          fontWeight="bold"
                          color="content.link"
                          mb="8px"
                          borderBottom="1px solid"
                          borderColor="border.overlay"
                          pb="12px"
                        >
                          {t("subactions")} (
                          {planToDisplay.content.subactions.items.length})
                        </TitleLarge>
                        <VStack gap="12px" alignItems="flex-start" w="full">
                          {planToDisplay.content.subactions.items.map(
                            (subaction: any, index: number) => (
                              <Box
                                key={index}
                                display="flex"
                                gap="4px"
                                alignItems="baseline"
                              >
                                <BodyLarge color="content.primary" mb="4px">
                                  {subaction.number}.
                                </BodyLarge>
                                <Box
                                  p="12px"
                                  bg="background.muted"
                                  borderRadius="md"
                                  w="full"
                                >
                                  <BodyLarge color="content.primary" mb="4px">
                                    {subaction.title}
                                  </BodyLarge>
                                  <BodyLarge color="content.secondary">
                                    {subaction.description}
                                  </BodyLarge>
                                </Box>
                              </Box>
                            ),
                          )}
                        </VStack>
                      </Box>
                    )}

                    {/* Municipal Institutions */}
                    {planToDisplay.content?.institutions?.items && (
                      <Box w="full">
                        <TitleLarge
                          fontWeight="bold"
                          color="content.link"
                          mb="8px"
                          borderBottom="1px solid"
                          borderColor="border.overlay"
                          pb="12px"
                        >
                          {t("municipal-institutions-involved")} (
                          {planToDisplay.content.institutions.items.length})
                        </TitleLarge>
                        <VStack gap="8px" alignItems="flex-start" w="full">
                          {planToDisplay.content.institutions.items.map(
                            (institution: any, index: number) => (
                              <Box
                                key={index}
                                p="12px"
                                bg="background.muted"
                                borderRadius="md"
                                w="full"
                              >
                                <BodyLarge
                                  color="content.primary"
                                  mb="4px"
                                  fontWeight="bold"
                                >
                                  &bull; {institution.name}
                                </BodyLarge>
                                <BodyLarge color="content.secondary">
                                  {institution.description}
                                </BodyLarge>
                              </Box>
                            ),
                          )}
                        </VStack>
                      </Box>
                    )}

                    {/* Milestones */}
                    {planToDisplay.content?.milestones?.items && (
                      <Box w="full">
                        <TitleLarge
                          fontWeight="bold"
                          color="content.link"
                          mb="8px"
                          borderBottom="1px solid"
                          borderColor="border.overlay"
                          pb="12px"
                        >
                          {t("pdf.sections.milestones")} (
                          {planToDisplay.content.milestones.items.length})
                        </TitleLarge>
                        <VStack gap="12px" alignItems="flex-start" w="full">
                          {planToDisplay.content.milestones.items.map(
                            (milestone: any, index: number) => (
                              <Box
                                key={index}
                                display="flex"
                                gap="4px"
                                alignItems="baseline"
                              >
                                <BodyLarge color="content.primary" mb="4px">
                                  {milestone.number}.
                                </BodyLarge>
                                <Box
                                  p="12px"
                                  bg="background.muted"
                                  borderRadius="md"
                                  w="full"
                                >
                                  <BodyLarge color="content.primary" mb="4px">
                                    {milestone.title}
                                  </BodyLarge>
                                  <BodyLarge color="content.secondary">
                                    {milestone.description}
                                  </BodyLarge>
                                </Box>
                              </Box>
                            ),
                          )}
                        </VStack>
                      </Box>
                    )}

                    {/* Mitigation Measures */}
                    {planToDisplay.content?.mitigations?.items && (
                      <Box w="full">
                        <TitleLarge
                          fontWeight="bold"
                          color="content.link"
                          mb="8px"
                          borderBottom="1px solid"
                          borderColor="border.overlay"
                          pb="12px"
                        >
                          {t("pdf.sections.mitigation-measures")} (
                          {planToDisplay.content.mitigations.items.length})
                        </TitleLarge>
                        <VStack gap="8px" alignItems="flex-start" w="full">
                          {planToDisplay.content.mitigations.items.map(
                            (mitigation: any, index: number) => (
                              <Box
                                key={index}
                                p="12px"
                                bg="background.muted"
                                borderRadius="md"
                                w="full"
                              >
                                <BodyLarge
                                  color="content.primary"
                                  mb="4px"
                                  fontWeight="bold"
                                >
                                  &bull; {mitigation.title}
                                </BodyLarge>
                                <BodyLarge color="content.secondary">
                                  {mitigation.description}
                                </BodyLarge>
                              </Box>
                            ),
                          )}
                        </VStack>
                      </Box>
                    )}

                    {/* Adaptation Measures */}
                    {planToDisplay.content?.adaptations?.items && (
                      <Box w="full">
                        <TitleLarge
                          fontWeight="bold"
                          color="content.link"
                          mb="8px"
                          borderBottom="1px solid"
                          borderColor="border.overlay"
                          pb="12px"
                        >
                          {t("pdf.sections.adaptation-measures")} (
                          {planToDisplay.content.adaptations.items.length})
                        </TitleLarge>
                        <VStack gap="8px" alignItems="flex-start" w="full">
                          {planToDisplay.content.adaptations.items.map(
                            (adaptation: any, index: number) => (
                              <Box
                                key={index}
                                p="12px"
                                bg="background.muted"
                                borderRadius="md"
                                w="full"
                              >
                                <BodyLarge
                                  color="content.primary"
                                  mb="4px"
                                  fontWeight="bold"
                                >
                                  &bull; {adaptation.title}
                                </BodyLarge>
                                <BodyLarge color="content.secondary">
                                  {adaptation.description}
                                </BodyLarge>
                              </Box>
                            ),
                          )}
                        </VStack>
                      </Box>
                    )}

                    {/* Sustainable Development Goals */}
                    {planToDisplay.content?.sdgs?.items && (
                      <Box w="full">
                        <TitleLarge
                          fontWeight="bold"
                          color="content.link"
                          mb="8px"
                          borderBottom="1px solid"
                          borderColor="border.overlay"
                          pb="12px"
                        >
                          {t("pdf.sections.sustainable-development-goals")} (
                          {planToDisplay.content.sdgs.items.length})
                        </TitleLarge>
                        <VStack gap="8px" alignItems="flex-start" w="full">
                          {planToDisplay.content.sdgs.items.map(
                            (sdg: any, index: number) => (
                              <Box
                                key={index}
                                p="12px"
                                bg="background.muted"
                                borderRadius="md"
                                w="full"
                              >
                                <BodyLarge
                                  color="content.primary"
                                  mb="4px"
                                  fontWeight="bold"
                                >
                                  &bull; {sdg.title}
                                </BodyLarge>
                                <BodyLarge color="content.secondary">
                                  {sdg.description}
                                </BodyLarge>
                              </Box>
                            ),
                          )}
                        </VStack>
                      </Box>
                    )}
                  </>
                )}
              </VStack>
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
};
