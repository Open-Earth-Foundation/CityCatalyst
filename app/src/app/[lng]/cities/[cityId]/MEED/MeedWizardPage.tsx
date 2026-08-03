"use client";
import React from "react";
import { Box, Card, HStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { useRouter } from "next/navigation";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { MeedStepBar } from "./MeedStepBar";
import { MEED_WIZARD_STEPS, getMeedPath } from "./steps";

/**
 * Shared shell for MEED wizard step pages: step bar on top, content column
 * below, previous/next navigation at the bottom. Step pages render their
 * screen content as children; until each screen is ported it shows a
 * placeholder card.
 */
export function MeedWizardPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
  stepKey: string;
  children?: React.ReactNode;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed");
  const router = useRouter();

  const stepIndex = MEED_WIZARD_STEPS.findIndex(
    (s) => s.key === props.stepKey,
  );
  const step = MEED_WIZARD_STEPS[stepIndex];
  const prevStep = stepIndex > 0 ? MEED_WIZARD_STEPS[stepIndex - 1] : null;
  const nextStep =
    stepIndex < MEED_WIZARD_STEPS.length - 1
      ? MEED_WIZARD_STEPS[stepIndex + 1]
      : null;

  return (
    <Box h="full" bg="background.backgroundLight" display="flex" flexDirection="column">
      <MeedStepBar
        activeStep={stepIndex}
        lng={lng}
        cityId={cityId}
        inventoryId={inventoryId}
        t={t}
      />
      <Box
        display="flex"
        mx="auto"
        py="48px"
        px="24px"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="24px"
      >
        <HeadlineSmall>{t(step?.labelKey ?? "overview-title")}</HeadlineSmall>
        {props.children ?? (
          <Card.Root>
            <Card.Body>
              <BodyLarge color="content.secondary">
                {t("step-placeholder-description")}
              </BodyLarge>
            </Card.Body>
          </Card.Root>
        )}
        <HStack justifyContent="space-between" w="full" pt="16px">
          <CCTerraButton
            variant="outlined"
            onClick={() =>
              router.push(
                getMeedPath(lng, cityId, inventoryId, prevStep?.segment),
              )
            }
          >
            {prevStep ? t("previous-step") : t("back-to-overview")}
          </CCTerraButton>
          {nextStep ? (
            <CCTerraButton
              onClick={() =>
                router.push(
                  getMeedPath(lng, cityId, inventoryId, nextStep.segment),
                )
              }
            >
              {t("next-step")}
            </CCTerraButton>
          ) : (
            <CCTerraButton
              onClick={() =>
                router.push(
                  getMeedPath(lng, cityId, inventoryId, "processing"),
                )
              }
            >
              {t("generate-ranking")}
            </CCTerraButton>
          )}
        </HStack>
      </Box>
    </Box>
  );
}
