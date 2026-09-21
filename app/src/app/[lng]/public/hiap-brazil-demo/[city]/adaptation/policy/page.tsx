"use client";
import React, { useState } from "react";
import {
  Box,
  Card,
  Collapsible,
  HStack,
  Icon,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp, LuInfo } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import { MeedScoreRing } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedScoreRing";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT, useTrackT } from "../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import { pick } from "../../../_lib/localized";

const gradeOf = (score: number) =>
  score >= 66 ? "strong" : score >= 33 ? "medium" : score > 0 ? "weak" : "none";
const GRADE_TONE: Record<string, MeedTone> = {
  strong: "positive",
  medium: "warning",
  weak: "neutral",
  none: "neutral",
};

/** BR-A9 — policy alignment: match × strength, Portuguese authoritative. */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const tResults = useTrackT(lng, "adaptation", "meed-results");
  const [open, setOpen] = useState<string | null>(null);
  const actions = [...ADAPTATION_ACTIONS].sort(
    (a, b) => b.policy.score - a.policy.score,
  );
  const mean =
    actions.reduce((s, a) => s + a.policy.score, 0) / actions.length / 100;
  const docs = new Set(
    actions.flatMap((a) => a.policy.evidence.map((e) => e.document)),
  );
  const counts = ["strong", "medium", "weak", "none"].map((g) => ({
    g,
    n: actions.filter((a) => gradeOf(a.policy.score) === g).length,
  }));

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="policy"
      screenId={SCREEN_IDS.adaptation.policy}
      title={t("policy-title")}
      description={t("policy-intro")}
      backLabel={t("back-to-home")}
    >
      <HStack
        gap="s"
        px="m"
        py="s"
        borderRadius="rounded"
        bg="background.neutral"
        alignItems="flex-start"
        alignSelf="flex-start"
      >
        <Icon as={LuInfo} boxSize="16px" color="content.link" mt="2px" />
        <Caption color="content.secondary">
          {t("policy-city-independent-note")}
        </Caption>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="m">
        <Card.Root borderColor="border.overlay" h="full">
          <Card.Body p="m">
            <HStack alignItems="center" gap="m">
              <MeedScoreRing
                value={mean}
                tone={
                  mean >= 0.66
                    ? "positive"
                    : mean >= 0.33
                      ? "warning"
                      : "neutral"
                }
                size="lg"
                ariaLabel={t("policy-mean-aria", {
                  value: Math.round(mean * 100),
                })}
                t={tResults}
              />
              <VStack alignItems="stretch" gap="xs" flex="1" minW={0}>
                <Overline>{t("policy-mean-label")}</Overline>
                <LabelMedium color="content.primary">
                  {t("policy-mean-value", { value: Math.round(mean * 100) })}
                </LabelMedium>
                <Caption>{t("policy-mean-note")}</Caption>
              </VStack>
            </HStack>
          </Card.Body>
        </Card.Root>
        <Card.Root borderColor="border.overlay" h="full">
          <Card.Body p="m">
            <VStack alignItems="flex-start" gap="s">
              <Overline>{t("policy-corpus-label")}</Overline>
              <TitleMedium color="content.primary">{docs.size}</TitleMedium>
              <Caption>{t("policy-corpus-note")}</Caption>
            </VStack>
          </Card.Body>
        </Card.Root>
        <Card.Root borderColor="border.overlay" h="full">
          <Card.Body p="m">
            <VStack alignItems="flex-start" gap="s">
              <Overline>{t("policy-grades-label")}</Overline>
              <HStack gap="xs" flexWrap="wrap">
                {counts.map(({ g, n }) => (
                  <MeedStatusTag key={g} tone={GRADE_TONE[g]}>
                    {t(`policy-grade-${g}`)} · {n}
                  </MeedStatusTag>
                ))}
              </HStack>
              <Caption>{t("policy-grades-note")}</Caption>
            </VStack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <Card.Root overflow="hidden" borderColor="border.neutral">
        <HStack
          px="l"
          py="m"
          borderBottomWidth="1px"
          borderColor="border.overlay"
          justifyContent="space-between"
          flexWrap="wrap"
          gap="m"
        >
          <VStack alignItems="flex-start" gap="xs">
            <TitleMedium color="content.primary">
              {t("policy-table-title")}
            </TitleMedium>
            <BodySmall color="content.secondary">
              {t("policy-table-description")}
            </BodySmall>
          </VStack>
          <MeedStatusTag tone="info">
            {t("policy-pt-authoritative")}
          </MeedStatusTag>
        </HStack>
        <VStack alignItems="stretch" gap="0">
          {actions.map((a) => {
            const g = gradeOf(a.policy.score);
            const isOpen = open === a.id;
            return (
              <Collapsible.Root
                key={a.id}
                open={isOpen}
                onOpenChange={(d) => setOpen(d.open ? a.id : null)}
              >
                <Collapsible.Trigger asChild>
                  <Box
                    as="button"
                    w="full"
                    textAlign="start"
                    px="l"
                    py="m"
                    borderBottomWidth="1px"
                    borderColor="border.overlay"
                    _hover={{ bg: "background.neutral" }}
                    _focusVisible={FOCUS_RING}
                  >
                    <HStack
                      justifyContent="space-between"
                      gap="m"
                      flexWrap="wrap"
                    >
                      <VStack
                        alignItems="flex-start"
                        gap="0"
                        flex="1"
                        minW="240px"
                      >
                        <LabelLarge color="content.primary">
                          {pick(a.name, lng)}
                        </LabelLarge>
                        <Caption color="content.tertiary">
                          {t("policy-evidence-count", {
                            count: a.policy.evidence.length,
                          })}
                        </Caption>
                      </VStack>
                      <Box w="200px">
                        <MeedMeter
                          value={a.policy.score / 100}
                          tone={GRADE_TONE[g]}
                          valueText={a.policy.score.toFixed(1)}
                        />
                      </Box>
                      <MeedStatusTag tone={GRADE_TONE[g]}>
                        {t(`policy-grade-${g}`)}
                      </MeedStatusTag>
                      <Icon
                        as={isOpen ? LuChevronUp : LuChevronDown}
                        boxSize="16px"
                        color="content.tertiary"
                      />
                    </HStack>
                  </Box>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <Box
                    px="l"
                    py="m"
                    bg="background.neutral"
                    borderBottomWidth="1px"
                    borderColor="border.overlay"
                  >
                    {a.policy.evidence.length === 0 ? (
                      <BodySmall color="content.secondary">
                        {t("policy-no-evidence")}
                      </BodySmall>
                    ) : (
                      <Table.Root size="sm">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader>
                              {t("policy-col-document")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader w="60px">
                              {t("policy-col-page")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("policy-col-match")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("policy-col-text")}
                            </Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {a.policy.evidence.map((e, i) => (
                            <Table.Row key={i}>
                              <Table.Cell>
                                <LabelMedium color="content.primary">
                                  {e.document}
                                </LabelMedium>
                                <Caption color="content.tertiary">
                                  {t(`tier-${e.documentTier}`)} · {e.recordType}
                                </Caption>
                              </Table.Cell>
                              <Table.Cell>
                                <BodySmall color="content.secondary">
                                  {t("policy-page-short", { page: e.page })}
                                </BodySmall>
                              </Table.Cell>
                              <Table.Cell>
                                <VStack alignItems="flex-start" gap="xs">
                                  <MeedStatusTag
                                    tone={
                                      e.match === "direct"
                                        ? "positive"
                                        : e.match === "partial"
                                          ? "warning"
                                          : "neutral"
                                    }
                                  >
                                    {t(`match-${e.match}`)}
                                  </MeedStatusTag>
                                  <Caption color="content.tertiary">
                                    {t(`strength-${e.strength}`)} ·{" "}
                                    {t(e.explicit ? "explicit" : "inferred")} ·{" "}
                                    {t(`confidence-${e.confidence}`)}
                                  </Caption>
                                </VStack>
                              </Table.Cell>
                              <Table.Cell>
                                <BodyMedium
                                  color="content.primary"
                                  fontSize="body.sm"
                                  lang="pt-BR"
                                >
                                  {e.pt}
                                </BodyMedium>
                                <Caption
                                  color="content.tertiary"
                                  fontStyle="italic"
                                >
                                  {t("policy-en-aid")}: {e.en}
                                </Caption>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    )}
                  </Box>
                </Collapsible.Content>
              </Collapsible.Root>
            );
          })}
        </VStack>
      </Card.Root>
      <Caption color="content.tertiary">{t("policy-formula-note")}</Caption>
    </DemoShell>
  );
}
