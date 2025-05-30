import type { SectorAttributes } from "@/models/Sector";
import {
  Badge,
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
import { Action } from "./types";
import { ButtonMedium } from "@/components/Texts/Button";
import { BarVisualization } from "./CapActionTab";

export function ActionDrawer({
  action,
  isOpen,
  onClose,
  t
}: {
  action: Action;
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
}) {
  logger.info(action)
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
          <Stack  px={4} py={10}>
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


              {action.action.Sector && action.action.Sector.length > 0 && (
                <HStack gap={2} flexWrap="wrap">
                  {action.action.Sector.map((sector) => (
                    <ButtonMedium key={sector}>
                      {t(`sector.${sector}`)}
                    </ButtonMedium>
                  ))}
                </HStack>
              )}
              <TitleLarge>{action.action.ActionName}</TitleLarge>
              {action.action.ActionType && action.action.ActionType.length > 0 && (
                <HStack gap={2} flexWrap="wrap">
                  {action.action.ActionType.map((type) => (
                    <Badge color="green" key={type}>
                      <ButtonMedium color="green" key={type}>
                        {t(`action-type-${type}`)}
                      </ButtonMedium>
                    </Badge>
                  ))}
                </HStack>
              )}

              <TitleMedium>{t('action-description')}</TitleMedium>
              <BodyLarge>{action.action.Description}</BodyLarge>



              <VStack align="start" gap={4}>
                {action.action.ActionType.includes("mitigation") && (
                  <>
                    <TitleMedium>{t("ghg-reduction")}</TitleMedium>
                    {Object.entries((action as any).action.GHGReductionPotential)
                      .filter(([_, value]) => value !== null)
                      .map(([sector, value]) => (
                        <DisplayMedium key={sector} color="black">
                          {t(`sector.${sector}`)}: {value as string}%
                        </DisplayMedium>
                      ))}
                  </>
                )}
                {action.action.ActionType.includes("adaptation") && (
                  <HStack gap={2} align="center">
                    <BarVisualization
                      value={action.action.AdaptationEffectiveness === "high" ? 3 : action.action.AdaptationEffectiveness === "medium" ? 2 : 1}
                      total={3}
                    />
                  </HStack>
                )}
                <HStack gap={10}>
                  <VStack align="start">
                    <TitleMedium>{t("cost")}</TitleMedium>
                    <DisplayMedium color="black">{t(`cost-level.${action.action.CostInvestmentNeeded}`)}</DisplayMedium>
                  </VStack>
                  <VStack align="start">
                    <TitleMedium>{t("timeline-label")}</TitleMedium>
                    <DisplayMedium color="black">{t(`timeline.${action.action.TimelineForImplementation}`)}</DisplayMedium>
                  </VStack>
                </HStack>

                {action.action.ActionType.includes("adaptation") && (
                  <>
                    <TitleMedium>{t("adaptation-effectiveness-by-hazard")}</TitleMedium>
                    <HStack align="start" gap={8}>
                      <VStack align="start" gap={2} flex={1}>
                        {(action as any).action.Hazard.slice(0, Math.ceil((action as any).action.Hazard.length / 2)).map((hazard: string) => {
                          const effectiveness = (action as any).action.AdaptationEffectivenessPerHazard[hazard];
                          const value = effectiveness === "high" ? 3 : effectiveness === "medium" ? 2 : 1;
                          return (
                            <HStack key={hazard} gap={2} align="center" justify="space-between" w="full">
                              <ButtonMedium>{t(`hazard.${hazard}`)}</ButtonMedium>
                              <HStack gap={2} align="space-between">
                                <BarVisualization value={value} total={3} />
                                <Text fontSize="sm" color="gray.600">{t(`effectiveness-level.${effectiveness}`)}</Text>
                              </HStack>
                            </HStack>
                          );
                        })}
                      </VStack>
                      <VStack align="start" gap={2} flex={1}>
                        {(action as any).action.Hazard.slice(Math.ceil((action as any).action.Hazard.length / 2)).map((hazard: string) => {
                          const effectiveness = (action as any).action.AdaptationEffectivenessPerHazard[hazard];
                          const value = effectiveness === "high" ? 3 : effectiveness === "medium" ? 2 : 1;
                          return (
                            <HStack key={hazard} gap={2} align="center" justify="space-between" w="full">
                              <ButtonMedium>{t(`hazard.${hazard}`)}</ButtonMedium>
                              <HStack gap={2} align="center">
                                <BarVisualization value={value} total={3} />
                                <Text fontSize="sm" color="gray.600">{t(`effectiveness-level.${effectiveness}`)}</Text>
                              </HStack>
                            </HStack>
                          );
                        })}
                      </VStack>
                    </HStack>

                    <TitleMedium>{t("effectiveness")}</TitleMedium>
                    <Text>{t(`effectiveness-level.${(action as any).action.AdaptationEffectiveness}`)}</Text>
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
