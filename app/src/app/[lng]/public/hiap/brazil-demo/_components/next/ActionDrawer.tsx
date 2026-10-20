"use client";
import React, { useState } from "react";
import {
  Box,
  Collapsible,
  Drawer,
  HStack,
  Icon,
  Portal,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";
import type { TFunction } from "i18next";
import { CloseButton } from "@/components/ui/close-button";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import { SelectActionCheckbox } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/SelectActionCheckbox";
import { MeedScoreComposition } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedScoreComposition";
import type { AdaptationAction } from "../../_lib/types";
import type { NotRankedReason } from "../../_lib/ranking";
import { componentScore, explainRankingShort } from "../../_lib/ranking";
import type { TrackData } from "../../_lib/useTrack";
import type { useLabels } from "../../_lib/useLabels";
import { GRADE_LABEL, legalGrade, LEVEL_LABEL } from "../../_lib/legal";
import { fundingResult, GAP_LABEL, GAP_MEANING } from "../../_lib/finance";
import { coBenefitCells } from "../../_lib/coBenefits";
import { RELATED_ROLES, relatedActions } from "../../_lib/relationships";
import {
  RISK_CELL_BY_KEY,
  SECTOR_LABEL,
  UNCOVERED_HAZARD_LABEL,
} from "../../_lib/riskCells";
import { trackHref } from "../../_lib/hrefs";
import { METHODOLOGY_DOC_URL } from "../../_lib/links";
import { pick } from "../../_lib/localized";
import { indexTone } from "../RiskCellGrid";
import { Level } from "./Level";
import { SectorLabel } from "./SectorIcon";
import { TextLink } from "./TextLink";
import {
  COST_TONE,
  GAP_TONE,
  legalTone,
  POLICY_TONE,
  policyGrade,
  type RankedRow,
} from "./rows";

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <VStack
      alignItems="stretch"
      gap="m"
      pt="xl"
      borderTopWidth="1px"
      borderColor="border.overlay"
    >
      <HStack justifyContent="space-between" alignItems="center" gap="s">
        <Overline color="content.tertiary">{title}</Overline>
        {trailing}
      </HStack>
      {children}
    </VStack>
  );
}

/**
 * BR-N6 — the action drawer in reading order: what it is and why it ranks
 * here; the four delivery facts; co-benefits; the actions to plan it with;
 * and, collapsed, the calculation. Levels are dots and words, as everywhere
 * else on the proposal screens.
 */
export function ActionDrawer({
  action,
  row,
  reason,
  data,
  lng,
  t,
  tResults,
  labels,
  isRanked,
  onClose,
  onOpenAction,
  isSelected,
  onToggleSelect,
}: {
  action: AdaptationAction;
  row: RankedRow | null;
  reason: NotRankedReason | null;
  data: TrackData;
  lng: string;
  t: TFunction;
  tResults: TFunction;
  labels: ReturnType<typeof useLabels>;
  isRanked: (id: string) => boolean;
  onClose: () => void;
  onOpenAction: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const { city, weights } = data;
  const [methodOpen, setMethodOpen] = useState(false);
  const name = pick(action.name, lng);
  const grade = legalGrade(action.legal.score);
  const funding = fundingResult(action, city);
  const policy = policyGrade(action.policy.score);
  const cells = coBenefitCells(action);
  const related = relatedActions(action);
  const directLinks = action.links.filter((l) => l.directness === "direct");
  const hazardKey = row?.hazard ?? directLinks[0]?.cell ?? null;
  const hazardLabel = action.uncoveredHazard
    ? pick(UNCOVERED_HAZARD_LABEL[action.uncoveredHazard], lng)
    : hazardKey
      ? pick(RISK_CELL_BY_KEY[hazardKey].label, lng)
      : "—";
  const riskTone = hazardKey
    ? indexTone(city.risk[hazardKey]?.index ?? 0)
    : "neutral";
  const href = (segment: string) =>
    trackHref(lng, city.slug, "adaptation", segment);

  return (
    <Drawer.Root
      open
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="end"
      size={{ base: "full", md: "lg" }}
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="base.light">
            <Drawer.Header
              display="flex"
              flexDirection="column"
              alignItems="stretch"
              gap="m"
              px="xl"
              pt="xl"
              pb="l"
              borderBottomWidth="1px"
              borderColor="border.overlay"
            >
              <HStack
                justifyContent="space-between"
                alignItems="center"
                gap="s"
              >
                <SectorLabel sector={action.sector}>
                  {pick(SECTOR_LABEL[action.sector], lng)}
                </SectorLabel>
                <Drawer.CloseTrigger asChild>
                  <CloseButton
                    size="sm"
                    color="content.secondary"
                    aria-label={t("next-drawer-close")}
                  />
                </Drawer.CloseTrigger>
              </HStack>
              <Drawer.Title asChild>
                <TitleLarge color="content.primary">{name}</TitleLarge>
              </Drawer.Title>
              <BodyMedium color="content.primary">
                {pick(action.description, lng)}
              </BodyMedium>
              {(row || reason) && (
                <BodySmall color="content.secondary">
                  {row
                    ? explainRankingShort(row.scored, city, lng)
                    : t(`reason-${reason}-body`)}
                </BodySmall>
              )}
              <HStack gap="l" flexWrap="wrap">
                <Level tone={riskTone}>
                  {t("next-addresses", { hazard: hazardLabel })}
                  {hazardKey
                    ? ` · ${t("next-addresses-level", { level: t(`risk-level-${riskTone}`) })}`
                    : ""}
                </Level>
                <BodySmall color="content.secondary">
                  {labels.timeline(action.timeline)}
                </BodySmall>
              </HStack>
            </Drawer.Header>

            <Drawer.Body px="xl" py="0">
              <VStack alignItems="stretch" gap="xl" pb="xl">
                <VStack alignItems="stretch" gap="m" pt="xl">
                  <Overline color="content.tertiary">
                    {t("next-drawer-glance")}
                  </Overline>
                  <SimpleGrid columns={{ base: 1, sm: 2 }} gap="xl">
                    <VStack alignItems="flex-start" gap="xs">
                      <Level
                        label={t("next-fact-cost")}
                        info={t("next-info-cost")}
                        tone={COST_TONE[action.costBand]}
                      >
                        {t(`next-cost-${action.costBand}`)}
                      </Level>
                      <BodySmall color="content.secondary">
                        {t("next-fact-cost-line")}
                      </BodySmall>
                    </VStack>
                    <VStack alignItems="flex-start" gap="xs">
                      <Level
                        label={t("next-fact-legal")}
                        info={t("next-info-legal")}
                        tone={legalTone(grade)}
                      >
                        {pick(GRADE_LABEL[grade], lng)}
                      </Level>
                      <BodySmall color="content.secondary">
                        {t("next-fact-legal-line", {
                          level: pick(
                            LEVEL_LABEL[action.legal.responsibleLevel],
                            lng,
                          ),
                          count: action.legal.norms.length,
                        })}
                      </BodySmall>
                    </VStack>
                    <VStack alignItems="flex-start" gap="xs">
                      <Level
                        label={t("next-fact-funding")}
                        info={t("next-info-funding")}
                        tone={GAP_TONE[funding.gap]}
                      >
                        {pick(GAP_LABEL[funding.gap], lng)}
                      </Level>
                      <BodySmall color="content.secondary">
                        {pick(GAP_MEANING[funding.gap], lng)}{" "}
                        {city.capag === "nd"
                          ? t("next-fact-capag-nd")
                          : t("next-fact-capag", { grade: city.capag })}
                        .
                      </BodySmall>
                    </VStack>
                    <VStack alignItems="flex-start" gap="xs">
                      <Level
                        label={t("next-fact-policy")}
                        info={t("next-info-policy")}
                        tone={POLICY_TONE[policy]}
                      >
                        {t(`next-policy-${policy}`)}
                      </Level>
                      <BodySmall color="content.secondary">
                        {t("next-fact-policy-line")}
                      </BodySmall>
                    </VStack>
                  </SimpleGrid>
                </VStack>

                {related.length > 0 && (
                  <Section title={t("next-drawer-plan-with")}>
                    <VStack alignItems="stretch" gap="0">
                      {RELATED_ROLES.flatMap((role) =>
                        related
                          .filter((r) => r.role === role)
                          .map(({ action: other, rationale }) => (
                            <HStack
                              key={`${role}-${other.id}`}
                              justifyContent="space-between"
                              alignItems="flex-start"
                              gap="m"
                              py="m"
                              borderBottomWidth="1px"
                              borderColor="border.overlay"
                            >
                              <VStack
                                alignItems="flex-start"
                                gap="xs"
                                flex="1"
                                minW={0}
                              >
                                <Overline color="content.tertiary">
                                  {t(`next-role-${role}`)}
                                </Overline>
                                <LabelLarge color="content.primary">
                                  {pick(other.name, lng)}
                                </LabelLarge>
                                <BodySmall color="content.secondary">
                                  {pick(rationale, lng)}
                                </BodySmall>
                                {!isRanked(other.id) && (
                                  <BodySmall color="content.tertiary">
                                    {t("next-drawer-not-scored")}
                                  </BodySmall>
                                )}

                                <Section title={t("next-drawer-cobenefits")}>
                                  {cells.length === 0 ? (
                                    <BodyMedium color="content.secondary">
                                      {t("next-drawer-no-cobenefits")}
                                    </BodyMedium>
                                  ) : (
                                    <SimpleGrid
                                      columns={{ base: 1, sm: 2 }}
                                      gap="m"
                                    >
                                      {cells.map((c) =>
                                        c.kind === "in_impact" ? (
                                          <Level key={c.key} tone="neutral">
                                            {labels.coBenefit(c.key)} ·{" "}
                                            {t("matrix-in-impact")}
                                          </Level>
                                        ) : (
                                          <Level
                                            key={c.key}
                                            tone={
                                              c.value < 0
                                                ? "negative"
                                                : "positive"
                                            }
                                          >
                                            {labels.coBenefit(c.key)} ·{" "}
                                            {t(
                                              `matrix-scale-${c.value < 0 ? "adverse" : c.value > 1 ? "strong" : "benefit"}`,
                                            )}
                                          </Level>
                                        ),
                                      )}
                                    </SimpleGrid>
                                  )}
                                </Section>
                              </VStack>
                              <Box flexShrink={0}>
                                <TextLink
                                  onClick={() => onOpenAction(other.id)}
                                >
                                  {t("not-ranked-open")}
                                </TextLink>
                              </Box>
                            </HStack>
                          )),
                      )}
                    </VStack>
                  </Section>
                )}

                {row && (
                  <Collapsible.Root
                    open={methodOpen}
                    onOpenChange={(d) => setMethodOpen(d.open)}
                  >
                    <Section
                      title={t("next-drawer-method")}
                      trailing={
                        <TextLink
                          arrow={false}
                          onClick={() => setMethodOpen((v) => !v)}
                        >
                          {methodOpen
                            ? t("next-drawer-method-hide")
                            : t("next-drawer-method-show")}
                        </TextLink>
                      }
                    >
                      <Collapsible.Content>
                        <VStack alignItems="stretch" gap="xl">
                          <MeedScoreComposition
                            action={row.result}
                            weights={weights}
                            variant="detailed"
                            t={tResults}
                          />
                          <VStack alignItems="stretch" gap="m">
                            <Overline color="content.tertiary">
                              {t("next-drawer-hazards")}
                            </Overline>
                            {directLinks.map((link, i) => (
                              <BodySmall key={i} color="content.secondary">
                                {pick(RISK_CELL_BY_KEY[link.cell].label, lng)} ·{" "}
                                {t(`component-${link.component}`)} ·{" "}
                                {t(`effectiveness-${link.effectiveness}`)} ·{" "}
                                {t(`confidence-${link.confidence}`)} ·{" "}
                                {t("drawer-component-score", {
                                  score: componentScore(link, action).toFixed(
                                    2,
                                  ),
                                })}
                              </BodySmall>
                            ))}
                            {row.scored.cells[0] && (
                              <BodySmall color="content.tertiary">
                                {t("drawer-impact-formula", {
                                  cell: pick(
                                    RISK_CELL_BY_KEY[row.scored.cells[0].cell]
                                      .label,
                                    lng,
                                  ),
                                  raw: row.scored.cells[0].raw.toFixed(2),
                                  impact: row.scored.impact.toFixed(2),
                                })}
                              </BodySmall>
                            )}
                          </VStack>
                          <VStack alignItems="stretch" gap="s">
                            {row.scored.fallbacks.map((key) => (
                              <HStack key={key} gap="s" alignItems="flex-start">
                                <Icon
                                  as={LuInfo}
                                  boxSize="14px"
                                  color="content.link"
                                  mt="3px"
                                />
                                <BodySmall color="content.secondary">
                                  {t(`fallback-${key}`)}
                                </BodySmall>
                              </HStack>
                            ))}
                            <BodySmall color="content.tertiary">
                              {t("drawer-source-line", {
                                source: action.source.toUpperCase(),
                                id: action.id,
                              })}
                            </BodySmall>
                            <TextLink href={METHODOLOGY_DOC_URL} external>
                              {t("next-methodology-link")}
                            </TextLink>
                          </VStack>
                        </VStack>
                      </Collapsible.Content>
                    </Section>
                  </Collapsible.Root>
                )}

                <Section title={t("next-drawer-further")}>
                  <HStack gap="xl" flexWrap="wrap">
                    <TextLink href={`${href("next/legal")}#${action.id}`}>
                      {t("next-further-legal")}
                    </TextLink>
                    <TextLink href={href("finance")}>
                      {t("next-further-finance")}
                    </TextLink>
                    <TextLink href={href("policy")}>
                      {t("next-further-policy")}
                    </TextLink>
                  </HStack>
                </Section>
              </VStack>
            </Drawer.Body>

            {row && (
              <Drawer.Footer
                px="xl"
                bg="base.light"
                borderTopWidth="1px"
                borderColor="border.overlay"
                justifyContent="flex-start"
              >
                <HStack gap="s" alignItems="center">
                  <SelectActionCheckbox
                    checked={isSelected}
                    onToggle={() => onToggleSelect(action.id)}
                    ariaLabel={tResults("select-action", { name })}
                  />
                  <BodyMedium color="content.primary">
                    {tResults("detail-include-in-report")}
                  </BodyMedium>
                </HStack>
              </Drawer.Footer>
            )}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
