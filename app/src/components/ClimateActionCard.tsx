import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  Dialog,
  Icon,
  Portal,
  Text,
  HStack,
  VStack,
  Spinner,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { TopPickIcon, GeneratePlanIcon } from "@/components/icons";
import { HIAction } from "@/util/types";
import { useGenerateActionPlanMutation } from "@/services/api";
import { RiFile3Line } from "react-icons/ri";
import { GoLocation } from "react-icons/go";
import { LevelBadge } from "@/components/LevelBadge";
import { TitleLarge, TitleMedium, TitleSmall } from "./Texts/Title";
import { BodyLarge, BodySmall } from "./Texts/Body";
import { LabelMedium } from "./Texts/Label";
import { HeadlineMedium } from "./Texts/Headline";

export const ClimateActionCard = ({
  action,
  viewOnly = false,
  t,
  onSeeMoreClick,
  inventoryId,
  cityLocode,
  cityId,
}: {
  action: HIAction;
  viewOnly?: boolean;
  t: TFunction;
  onSeeMoreClick?: () => void;
  inventoryId?: string;
  cityLocode?: string;
  cityId?: string;
}) => {
  const getReductionColor = (level: string) => {
    switch (level) {
      case "high":
        return "sentiment.negativeDefault";
      case "medium":
        return "sentiment.warningDefault";
      case "low":
        return "content.link";
      default:
        return "content.tertiary";
    }
  };

  const getReductionPotentialLevel = (): string => {
    if (action.type === "mitigation" && action.GHGReductionPotential) {
      const ghgData = action.GHGReductionPotential;
      const values = Object.values(ghgData).filter((v) => v !== null);

      if (values.length === 0) return "medium";

      const highCount = values.filter((v) => v === "high").length;
      const lowCount = values.filter((v) => v === "low").length;

      if (highCount > 0) return "high";
      if (lowCount > values.length / 2) return "low";
      return "medium";
    } else if (action.type === "adaptation") {
      return action.adaptationEffectiveness || "medium";
    }

    return "medium";
  };

  const reductionLevel = getReductionPotentialLevel();

  return (
    <Card.Root
      p="24px"
      borderRadius="8px"
      maxW="353px"
      bg="background.secondary"
      gap="16px"
      position="relative"
    >
      {(action.isSelected || action.rank <= 3) && (
        <Card.Title display="flex" alignItems="center" gap="8px">
          <Icon as={TopPickIcon} />
          <Text
            fontSize="overline"
            color="content.link"
            fontWeight="bold"
            textTransform="uppercase"
            fontFamily="heading"
            letterSpacing="wider"
          >
            {t("top-pick")}
          </Text>
        </Card.Title>
      )}
      <Box pt={action.isSelected || action.rank <= 3 ? "32px" : "24px"}>
        <TitleLarge
          textOverflow="ellipsis"
          overflow="hidden"
          whiteSpace="nowrap"
          lineClamp={2}
          color="content.secondary"
        >
          {action.name}
        </TitleLarge>
        <BodySmall color="content.tertiary" mt="8px" lineClamp={2}>
          {action.description}
        </BodySmall>

        <Box display="flex" gap="8px" py="12px" w="full">
          <LevelBadge level={reductionLevel} />
        </Box>

        <Box
          display="flex"
          gap="8px"
          alignItems="center"
          justifyContent="space-between"
          borderBottom="1px solid"
          borderColor="border.overlay"
          pb="12px"
        >
          <LabelMedium color="content.tertiary">
            {t("reduction-potential")}
          </LabelMedium>
          <TitleMedium
            color={getReductionColor(reductionLevel)}
            textTransform="capitalize"
          >
            {t(reductionLevel)}
          </TitleMedium>
        </Box>

        <Box
          display="flex"
          flexDirection="column"
          gap="14px"
          w="full"
          py="28px"
          fontFamily="heading"
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <LabelMedium color="content.tertiary">
              {t("sector-name")}
            </LabelMedium>
            <TitleSmall color="content.tertiary" textTransform="capitalize">
              {action.sectors?.[0] || "N/A"}
            </TitleSmall>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <LabelMedium color="content.tertiary">
              {t("estimated-cost")}
            </LabelMedium>
            <TitleSmall color="content.tertiary" textTransform="capitalize">
              {t(action.costInvestmentNeeded)}
            </TitleSmall>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <LabelMedium color="content.tertiary">
              {t("implementation-time")}
            </LabelMedium>
            <TitleSmall color="content.tertiary">
              {t(action.timelineForImplementation)}
            </TitleSmall>
          </Box>

          {onSeeMoreClick && (
            <Box display="flex" justifyContent="flex-start">
              <Button
                variant="ghost"
                color="content.link"
                textDecoration="underline"
                textTransform="none"
                textStyle="label.lg"
                pl="0px"
                onClick={onSeeMoreClick}
              >
                {t("see-more-details")}
              </Button>
            </Box>
          )}
          {!viewOnly && (
            <>
              <GeneratePlanDialog
                t={t}
                action={action}
                inventoryId={inventoryId}
                cityLocode={cityLocode}
                cityId={cityId}
              />
            </>
          )}
        </Box>
      </Box>
    </Card.Root>
  );
};

const GeneratePlanDialog = ({
  t,
  action,
  inventoryId,
  cityLocode,
  cityId,
}: {
  t: TFunction;
  action: HIAction;
  inventoryId?: string;
  cityLocode?: string;
  cityId?: string;
}) => {
  const [generateActionPlan, { isLoading, error }] =
    useGenerateActionPlanMutation();
  const [generatedPlan, setGeneratedPlan] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const handleGeneratePlan = async () => {
    if (!inventoryId || !cityLocode) {
      console.error("Missing required data for plan generation:", {
        inventoryId,
        cityLocode,
      });
      return;
    }

    console.log("Generating plan for action:", action);
    console.log("Inventory ID:", inventoryId);
    console.log("City:", cityId);

    try {
      const result = await generateActionPlan({
        action: action,
        inventoryId: inventoryId,
        cityLocode: cityLocode,
        cityId: cityId!,
        lng: action.lang,
        rankingId: action.hiaRankingId,
      }).unwrap();

      // Parse the plan JSON string
      const planData = JSON.parse(result.plan);
      setGeneratedPlan(planData);
    } catch (error) {
      console.error("Failed to generate plan:", error);
    }
  };

  const handleExportPDF = async () => {
    if (!generatedPlan) {
      console.error("No plan data available for PDF export");
      return;
    }

    setIsPdfGenerating(true);

    try {
      // Get city name from cityLocode or use a default
      const cityName = cityLocode || "Unknown City";

      const response = await fetch(`/api/v0/action-plan/${action.id}/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planData: generatedPlan,
          cityName: cityName,
          actionTitle: action.name,
          lng: action.lang || "en",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `action-plan-${action.name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to export PDF:", error);
      // You could add a toast notification here for better UX
    } finally {
      setIsPdfGenerating(false);
    }
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
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
          {t("generate-plan")}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content h="80vh" minW="768px" maxH="80vh" p="24px">
            <Dialog.Header>
              <HStack
                justifyContent="space-between"
                w="full"
                alignItems="baseline"
                h="48px"
              >
                <Text
                  fontFamily="heading"
                  fontWeight="bold"
                  fontSize="overline"
                  color="content.link"
                  textTransform="uppercase"
                >
                  {t("generated-action-plan")}
                </Text>
                <Button
                  variant="ghost"
                  color="content.tertiary"
                  px="4px"
                  h="48px"
                  onClick={handleExportPDF}
                  disabled={!generatedPlan || isPdfGenerating}
                  loading={isPdfGenerating}
                >
                  <Icon as={RiFile3Line} boxSize="24px" />
                  {isPdfGenerating ? t("generating-pdf") : t("export-as-pdf")}
                </Button>
              </HStack>
            </Dialog.Header>
            <Dialog.Body overflow="scroll" maxH="70vh">
              <VStack alignItems="flex-start" gap="24px" w="full">
                {!generatedPlan && !isLoading && (
                  <>
                    <HeadlineMedium fontWeight="bold" color="content.primary">
                      Generate Implementation Plan for "{action.name}"
                    </HeadlineMedium>
                    <BodyLarge fontWeight="normal" color="content.tertiary">
                      Click the button below to generate a detailed
                      implementation plan for this climate action.
                    </BodyLarge>
                    <Button
                      colorScheme="blue"
                      w="full"
                      onClick={handleGeneratePlan}
                      disabled={isLoading || !inventoryId || !cityLocode}
                    >
                      <Icon as={GeneratePlanIcon} />
                      {!inventoryId || !cityLocode
                        ? "Missing data for plan generation"
                        : "Generate Implementation Plan"}
                    </Button>
                  </>
                )}

                {isLoading && (
                  <VStack gap="16px" w="full" alignItems="center" py="40px">
                    <Spinner size="lg" color="content.link" />
                    <Text color="content.secondary">
                      Generating your implementation plan...
                    </Text>
                    <Text fontSize="sm" color="content.tertiary">
                      This may take a few minutes
                    </Text>
                  </VStack>
                )}

                {error && (
                  <Box
                    w="full"
                    p="16px"
                    bg="sentiment.negativeSubtle"
                    borderRadius="md"
                  >
                    <Text color="sentiment.negativeDefault" fontWeight="bold">
                      Error generating plan
                    </Text>
                    <Text color="sentiment.negativeDefault" fontSize="sm">
                      {error.toString()}
                    </Text>
                  </Box>
                )}

                {generatedPlan && (
                  <>
                    <HeadlineMedium
                      fontWeight="bold"
                      color="content.primary"
                      pb="12px"
                    >
                      {generatedPlan.metadata?.actionName || action.name} -{" "}
                      {t("implementation-plan")}
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
                          {generatedPlan.metadata?.cityName}
                        </TitleLarge>
                      </Box>

                      <BodyLarge color="content.secondary" mb="16px">
                        {
                          generatedPlan.content?.introduction
                            ?.action_description
                        }
                      </BodyLarge>
                    </Box>

                    {/* Subactions */}
                    {generatedPlan.content?.subactions?.items && (
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
                          {generatedPlan.content.subactions.items.length})
                        </TitleLarge>
                        <VStack gap="12px" alignItems="flex-start" w="full">
                          {generatedPlan.content.subactions.items.map(
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
                    {generatedPlan.content?.institutions?.items && (
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
                          {generatedPlan.content.institutions.items.length})
                        </TitleLarge>
                        <VStack gap="8px" alignItems="flex-start" w="full">
                          {generatedPlan.content.institutions.items.map(
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
                  </>
                )}
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
