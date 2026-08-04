"use client";
import { Box, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import type { MeedStep } from "../steps";
import type { MeedSectionState } from "../meedStatus";
import { MeedStatusTag, STATUS_LABEL_KEY, STATUS_TONE } from "./MeedStatusTag";
import { MeedMeter } from "./MeedMeter";

export interface MeedSectionCardProps {
  step: MeedStep;
  state: MeedSectionState | undefined;
  href: string;
  t: TFunction;
}

/** Call-to-action wording follows how far along the section is. */
function ctaKey(status: string | undefined): string {
  switch (status) {
    case "complete":
      return "review-section";
    case "needs-review":
      return "review-section";
    case "in-progress":
      return "resume-where-you-left";
    default:
      return "start-section";
  }
}

/**
 * One input section on the overview.
 *
 * The whole card is a link — previously it was a div with an onClick, which
 * meant no keyboard access and no focus ring. It surfaces the four things the
 * flat version was missing: status, how much this input shapes the ranking, a
 * live detail line, and progress.
 */
export function MeedSectionCard({
  step,
  state,
  href,
  t,
}: MeedSectionCardProps) {
  const status = state?.status ?? "not-started";
  const progress = state?.progress;

  return (
    <Card.Root
      asChild
      h="full"
      borderWidth="1px"
      borderColor="border.overlay"
      transition="border-color 0.15s, box-shadow 0.15s"
      _hover={{ borderColor: "content.link", boxShadow: "2dp" }}
      _focusWithin={{
        outline: "2px solid",
        outlineColor: "content.link",
        outlineOffset: "2px",
      }}
    >
      <NextLink href={href}>
        <Card.Body display="flex" flexDirection="column" gap="10px" h="full">
          <HStack justifyContent="space-between" alignItems="center" gap="8px">
            {step.rankingWeight ? (
              <MeedStatusTag tone="info">
                {t("shapes-percent", { weight: step.rankingWeight })}
              </MeedStatusTag>
            ) : step.optional ? (
              <MeedStatusTag tone="neutral">{t("optional")}</MeedStatusTag>
            ) : (
              <Box />
            )}
            <MeedStatusTag tone={STATUS_TONE[status]}>
              {t(STATUS_LABEL_KEY[status])}
            </MeedStatusTag>
          </HStack>

          <TitleMedium color="content.primary">{t(step.labelKey)}</TitleMedium>

          {state?.sub && (
            <BodySmall color="sentiment.warningDefault">{state.sub}</BodySmall>
          )}

          <BodySmall color="content.secondary" flex="1">
            {t(`${step.labelKey}-description`)}
          </BodySmall>

          <HStack gap="4px" color="content.link" mt="2px">
            <LabelMedium color="content.link">{t(ctaKey(status))}</LabelMedium>
            <Icon as={LuArrowRight} boxSize="14px" />
          </HStack>

          {typeof progress === "number" && progress > 0 && (
            <MeedMeter
              value={progress / 100}
              tone={progress >= 100 ? "positive" : "warning"}
              height="4px"
              ariaLabel={`${t(step.labelKey)} — ${progress}%`}
            />
          )}
        </Card.Body>
      </NextLink>
    </Card.Root>
  );
}
