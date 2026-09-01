"use client";
import { Box, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight, LuRotateCw, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import { MeedButton } from "./MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import type { MeedStoredRanking } from "../meedLocalState";
import { MeedStatusTag } from "./MeedStatusTag";

export interface MeedRankingCardProps {
  ranking: MeedStoredRanking;
  /** Highest-ranked action names, resolved from the live catalog. */
  topActions: string[];
  /** True when inputs changed after this ranking was produced. */
  isStale: boolean;
  resultsHref: string;
  onRerun: () => void;
  lng: string;
  t: TFunction;
}

/**
 * Shown on the landing screen once a ranking exists.
 *
 * Once there is a result, the result — not the setup — is what the user came
 * back for, so this sits above the inputs and carries the primary action. It
 * also has to answer "is this still true?": when the user edits an input after
 * generating, the ranking silently stops matching their answers, so a changed
 * fingerprint surfaces as an explicit re-run prompt rather than quietly serving
 * a stale list.
 */
export function MeedRankingCard({
  ranking,
  topActions,
  isStale,
  resultsHref,
  onRerun,
  lng,
  t,
}: MeedRankingCardProps) {
  const totalRanked = ranking.result.ranked_actions?.length ?? 0;
  const generated = new Date(ranking.generatedAtUtc);
  const generatedLabel = Number.isNaN(generated.valueOf())
    ? null
    : new Intl.DateTimeFormat(lng, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(generated);

  return (
    <Card.Root
      borderColor={isStale ? "sentiment.warningDefault" : "border.overlay"}
      borderWidth="1px"
    >
      <Card.Body>
        <VStack alignItems="stretch" gap="m">
          <HStack justifyContent="space-between" alignItems="center" gap="m">
            <VStack alignItems="flex-start" gap="xs">
              <Overline color="content.tertiary">
                {t("ranking-eyebrow")}
              </Overline>
              <TitleMedium color="content.primary">
                {t("ranking-title", { count: totalRanked })}
              </TitleMedium>
            </VStack>
            <HStack gap="s" flexShrink={0}>
              {/* Sample data has to announce itself. The flag that produces it
                  is off by default, but when it is on nothing else tells a
                  synthetic ranking apart from a real one. */}
              {ranking.isMock && (
                <MeedStatusTag tone="warning">{t("sample-data")}</MeedStatusTag>
              )}
              <MeedStatusTag tone={isStale ? "warning" : "positive"}>
                {isStale ? t("ranking-stale-tag") : t("ranking-current-tag")}
              </MeedStatusTag>
            </HStack>
          </HStack>

          {topActions.length > 0 && (
            <VStack alignItems="stretch" gap="xs">
              <Overline color="content.tertiary">
                {t("ranking-top-actions")}
              </Overline>
              {topActions.slice(0, 3).map((name: string, i: number) => (
                <HStack key={`${name}-${i}`} gap="s" alignItems="baseline">
                  <BodySmall
                    color="content.link"
                    fontWeight="semibold"
                    fontVariantNumeric="tabular-nums"
                    minW="20px"
                  >
                    {i + 1}
                  </BodySmall>
                  <BodyMedium color="content.secondary">{name}</BodyMedium>
                </HStack>
              ))}
            </VStack>
          )}

          {isStale && (
            <HStack
              gap="s"
              px="m"
              py="s"
              borderRadius="rounded"
              bg="sentiment.warningOverlay"
              alignItems="flex-start"
            >
              <Icon
                as={LuTriangleAlert}
                boxSize="16px"
                color="sentiment.warningDefault"
                mt="xs"
              />
              <BodyMedium color="sentiment.warningDefault">
                {t("ranking-stale-body")}
              </BodyMedium>
            </HStack>
          )}

          <HStack gap="m" flexWrap="wrap" alignItems="center">
            <MeedButton asChild minW="auto" px="l">
              <NextLink href={resultsHref}>
                <HStack gap="s">
                  <Box as="span">{t("ranking-view")}</Box>
                  <Icon as={LuArrowRight} boxSize="16px" />
                </HStack>
              </NextLink>
            </MeedButton>
            <MeedButton variant="outlined" minW="auto" px="l" onClick={onRerun}>
              <HStack gap="s">
                <Icon as={LuRotateCw} boxSize="16px" />
                <Box as="span">{t("ranking-rerun")}</Box>
              </HStack>
            </MeedButton>
            {generatedLabel && (
              <BodySmall color="content.tertiary">
                {t("ranking-generated-at", { when: generatedLabel })}
              </BodySmall>
            )}
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
