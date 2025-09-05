import type { SectorAttributes } from "@/models/Sector";
import {
  Badge,
  Box,
  Heading,
  HStack,
  Icon,
  Link,
  Separator,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { RefObject } from "react";
import { MdArrowBack, MdHomeWork, MdInfoOutline } from "react-icons/md";
import { getTranslationFromDict } from "@/i18n";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerRoot,
} from "@/components/ui/drawer";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { TitleLarge, TitleMedium } from "@/components/Texts/Title";
import { BodyLarge } from "@/components/Texts/Body";
import { DisplayMedium } from "@/components/Texts/Display";
import {
  HIAction,
  MitigationAction,
  AdaptationAction,
  ACTION_TYPES,
} from "@/util/types";
import { ButtonMedium } from "@/components/Texts/Button";
import { BarVisualization } from "@/components/BarVisualization";

export function ActionDrawer({
  action,
  isOpen,
  onClose,
  t,
}: {
  action: HIAction;
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
}) {
  // Extract GHG Reduction Potential entries
  const ghgReductionEntries =
    action.type === ACTION_TYPES.Mitigation
      ? Object.entries(
          (action as MitigationAction).GHGReductionPotential,
        ).filter(([_, value]) => value !== null)
      : [];

  // Helper to get effectiveness bar value
  const getEffectivenessValue = (effectiveness: string | null | undefined) => {
    if (effectiveness === "high") return 3;
    if (effectiveness === "medium") return 2;
    return 1;
  };

  // Helper to render a single adaptation effectiveness row
  const renderAdaptationEffectivenessRow = (
    hazard: string,
    effectiveness: string | null | undefined,
    align: "center" | "space-between" = "center",
  ) => (
    <HStack
      key={hazard}
      gap={2}
      align="center"
      justify="space-between"
      w="full"
    >
      <ButtonMedium>{t(`hazard.${hazard}`)}</ButtonMedium>
      <HStack gap={2} align={align}>
        <BarVisualization
          value={getEffectivenessValue(effectiveness)}
          total={3}
        />
        <Text fontSize="sm" color="gray.600">
          {t(`effectiveness-level.${effectiveness}`)}
        </Text>
      </HStack>
    </HStack>
  );

  // Extract and split adaptationEffectivenessPerHazard entries for columns
  let adaptationEffectivenessFirstCol: [string, string | null][] = [];
  let adaptationEffectivenessSecondCol: [string, string | null][] = [];
  if (action.type === ACTION_TYPES.Adaptation) {
    const entries = Object.entries(
      (action as AdaptationAction).adaptationEffectivenessPerHazard,
    ).filter(([_, effectiveness]) => effectiveness !== null);
    const splitIndex = Math.ceil(entries.length / 2);
    adaptationEffectivenessFirstCol = entries.slice(0, splitIndex);
    adaptationEffectivenessSecondCol = entries.slice(splitIndex);
  }

  return (
    <DrawerRoot
      open={isOpen}
      placement="end"
      onExitComplete={onClose}
      size="xl"
    >
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerBody>
          <Stack px={4} py={10}>
            <Button
              variant="ghost"
              color="content.link"
              alignSelf="flex-start"
              onClick={onClose}
              px={6}
              py={4}
              mb={6}
            >
              <Icon as={MdArrowBack} boxSize={4} />
              {t("go-back")}
            </Button>
            <Stack gap={6}>
              {action.sectors && (
                <HStack gap={2} flexWrap="wrap">
                  {action.sectors.map((sector) => (
                    <ButtonMedium key={sector}>
                      {t(`sector.${sector}`)}
                    </ButtonMedium>
                  ))}
                </HStack>
              )}
              <TitleLarge>{action.name}</TitleLarge>
              {action.primaryPurposes && (
                <HStack gap={2} flexWrap="wrap">
                  {action.primaryPurposes.map((primaryPurpose) => (
                    <Badge color="green" key={primaryPurpose}>
                      <ButtonMedium key={primaryPurpose}>
                        {t(`primary-purpose.${primaryPurpose}`)}
                      </ButtonMedium>
                    </Badge>
                  ))}
                </HStack>
              )}

              <TitleMedium>{t("action-description")}</TitleMedium>
              <BodyLarge>{action.description}</BodyLarge>

              <VStack align="start" gap={4}>
                {action.type === ACTION_TYPES.Mitigation && (
                  <>
                    <TitleMedium>{t("ghg-reduction")}</TitleMedium>
                    {ghgReductionEntries.map(([sector, value]) => (
                      <DisplayMedium key={sector} color="black">
                        {t(`sector.${sector}`)}: {value as string}%
                      </DisplayMedium>
                    ))}
                  </>
                )}
                {action.type === ACTION_TYPES.Adaptation && (
                  <>
                    <HStack>
                      <TitleMedium>{t("adaptation-effectiveness")}</TitleMedium>
                      <Text>
                        {t(
                          `effectiveness-level.${(action as AdaptationAction).adaptationEffectiveness}`,
                        )}
                      </Text>
                    </HStack>
                    <HStack gap={2} align="center" width="full">
                      <BarVisualization
                        width="200px"
                        value={getEffectivenessValue(
                          (action as AdaptationAction).adaptationEffectiveness,
                        )}
                        total={3}
                      />
                    </HStack>
                  </>
                )}
                <HStack gap={10}>
                  <VStack align="start">
                    <TitleMedium>{t("cost")}</TitleMedium>
                    <DisplayMedium color="black">
                      {t(`cost-level.${action.costInvestmentNeeded}`)}
                    </DisplayMedium>
                  </VStack>
                  <VStack align="start">
                    <TitleMedium>{t("timeline-label")}</TitleMedium>
                    <DisplayMedium color="black">
                      {t(`timeline.${action.timelineForImplementation}`)}
                    </DisplayMedium>
                  </VStack>
                </HStack>

                {action.type === ACTION_TYPES.Adaptation && (
                  <>
                    <TitleMedium>
                      {t("adaptation-effectiveness-by-hazard")}
                    </TitleMedium>
                    <HStack align="start" gap={8}>
                      <VStack align="start" gap={2} flex={1}>
                        {adaptationEffectivenessFirstCol.map(
                          ([hazard, effectiveness]) =>
                            renderAdaptationEffectivenessRow(
                              hazard,
                              effectiveness,
                              "space-between",
                            ),
                        )}
                      </VStack>
                      <VStack align="start" gap={2} flex={1}>
                        {adaptationEffectivenessSecondCol.map(
                          ([hazard, effectiveness]) =>
                            renderAdaptationEffectivenessRow(
                              hazard,
                              effectiveness,
                              "center",
                            ),
                        )}
                      </VStack>
                    </HStack>
                  </>
                )}
              </VStack>
            </Stack>
          </Stack>
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
}
