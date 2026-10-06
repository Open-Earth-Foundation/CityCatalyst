"use client";
import React from "react";
import {
  Box,
  HStack,
  Icon,
  Link,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { DrawerSection } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/DetailPanel";
import { MeedInfoTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedInfoTip";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { AdaptationAction, CityFixture, DemoTrack } from "../_lib/types";
import type { ScoredAction } from "../_lib/ranking";
import { componentScore } from "../_lib/ranking";
import {
  RISK_CELL_BY_KEY,
  SECTOR_HEX,
  UNCOVERED_HAZARD_LABEL,
} from "../_lib/riskCells";
import { pick } from "../_lib/localized";
import {
  GRADE_LABEL,
  GRADE_TONE,
  LEVEL_LABEL,
  legalGrade,
} from "../_lib/legal";
import {
  fundingResult,
  GAP_LABEL,
  GAP_MEANING,
  PATHWAY_BY_KEY,
} from "../_lib/finance";
import { suppressionSources, CO_BENEFIT_LABEL } from "../_lib/coBenefits";
import { RELATED_ROLES, relatedActions } from "../_lib/relationships";
import { trackHref } from "../_lib/hrefs";
import { ActionMiniCard } from "./ActionMiniCard";

const LEVEL_TONE: Record<string, MeedTone> = {
  high: "positive",
  medium: "info",
  low: "neutral",
};

/**
 * The adaptation-specific half of the action drawer — what the shared
 * `DetailPanel` cannot know: which risk cells the action credits and how,
 * the actions to plan it with, the legal grade, the funding pathways, and
 * where the score relied on a placeholder or a fallback. Every block is a
 * `DrawerSection` card so it matches the shared ones above it.
 */
export function AdaptationDrawerSections({
  action,
  scored,
  city,
  lng,
  t,
  rankOf,
  onOpenAction,
}: {
  action: AdaptationAction;
  scored: ScoredAction | null;
  city: CityFixture;
  lng: string;
  t: TFunction;
  /** Current rank of an action id, or null when it is not in the ranking. */
  rankOf: (id: string) => number | null;
  onOpenAction: (id: string) => void;
}) {
  const track: DemoTrack = "adaptation";
  const grade = legalGrade(action.legal.score);
  const funding = fundingResult(action, city);
  const suppressed = suppressionSources(action);
  const directLinks = action.links.filter((l) => l.directness === "direct");
  const otherLinks = action.links.filter((l) => l.directness !== "direct");
  const related = relatedActions(action);
  const legalHref = `${trackHref(lng, city.slug, track, "legal")}#${action.id}`;

  return (
    <>
      {/* Risk cells credited */}
      <DrawerSection title={t("drawer-risk-title")}>
        {action.uncoveredHazard ? (
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
              mt="2px"
            />
            <BodyMedium color="content.secondary">
              {t("drawer-uncovered-body", {
                hazard: pick(
                  UNCOVERED_HAZARD_LABEL[action.uncoveredHazard],
                  lng,
                ),
              })}
            </BodyMedium>
          </HStack>
        ) : directLinks.length === 0 ? (
          <BodyMedium color="content.secondary">
            {t("drawer-no-direct-links")}
          </BodyMedium>
        ) : (
          <Box
            borderWidth="1px"
            borderColor="border.overlay"
            borderRadius="rounded"
            overflow="hidden"
          >
            <Table.Root size="md">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>
                    {t("drawer-col-cell")}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("drawer-col-effect")}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader w="34%">
                    {t("drawer-col-city-index")}
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {directLinks.map((link, i) => {
                  const cell = RISK_CELL_BY_KEY[link.cell];
                  const reading = city.risk[link.cell];
                  const cityIndex = reading ? reading[link.component] : null;
                  return (
                    <Table.Row key={`${link.cell}-${link.component}-${i}`}>
                      <Table.Cell>
                        <HStack gap="s" alignItems="flex-start">
                          <Box
                            boxSize="10px"
                            mt="5px"
                            borderRadius="full"
                            bg={SECTOR_HEX[cell.sector]}
                            flexShrink={0}
                          />
                          <VStack alignItems="flex-start" gap="xs" minW={0}>
                            <LabelMedium color="content.primary">
                              {pick(cell.label, lng)}
                            </LabelMedium>
                            <MeedStatusTag tone="neutral">
                              {t(`component-${link.component}`)}
                            </MeedStatusTag>
                          </VStack>
                        </HStack>
                      </Table.Cell>
                      <Table.Cell>
                        <VStack alignItems="flex-start" gap="xs">
                          <HStack gap="xs" flexWrap="wrap">
                            <MeedStatusTag
                              tone={LEVEL_TONE[link.effectiveness ?? "low"]}
                            >
                              {t(`effectiveness-${link.effectiveness}`)}
                            </MeedStatusTag>
                            <MeedStatusTag tone="neutral">
                              {t(`confidence-${link.confidence}`)}
                            </MeedStatusTag>
                            {link.maladaptation && (
                              <MeedStatusTag tone="warning">
                                {t("drawer-maladaptation-tag")}
                              </MeedStatusTag>
                            )}
                          </HStack>
                          <BodySmall
                            color="content.tertiary"
                            fontVariantNumeric="tabular-nums"
                          >
                            {t("drawer-component-score", {
                              score: componentScore(link, action).toFixed(2),
                            })}
                          </BodySmall>
                        </VStack>
                      </Table.Cell>
                      <Table.Cell>
                        {cityIndex === null ? (
                          <MeedStatusTag tone="neutral">—</MeedStatusTag>
                        ) : (
                          <MeedMeter
                            value={cityIndex}
                            tone={
                              cityIndex === 0
                                ? "negative"
                                : cityIndex >= 0.7
                                  ? "warning"
                                  : "info"
                            }
                            valueText={cityIndex.toFixed(2)}
                          />
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
        {scored && scored.cells[0] && (
          <BodySmall color="content.tertiary">
            {t("drawer-impact-formula", {
              cell: pick(RISK_CELL_BY_KEY[scored.cells[0].cell].label, lng),
              raw: scored.cells[0].raw.toFixed(2),
              impact: scored.impact.toFixed(2),
            })}
          </BodySmall>
        )}
        {otherLinks.length > 0 && (
          <VStack alignItems="stretch" gap="s">
            {otherLinks.map((link, i) => (
              <HStack key={i} gap="s" alignItems="flex-start">
                <Icon
                  as={LuInfo}
                  boxSize="14px"
                  color="content.tertiary"
                  mt="3px"
                />
                <BodySmall color="content.tertiary">
                  {pick(RISK_CELL_BY_KEY[link.cell].label, lng)} ·{" "}
                  {t(`directness-${link.directness}`)} —{" "}
                  {pick(link.rationale, lng)}
                </BodySmall>
              </HStack>
            ))}
          </VStack>
        )}
        {action.links.some((l) => l.maladaptation) && (
          <BodyMedium color="content.secondary">
            {t("drawer-maladaptation-body")}
          </BodyMedium>
        )}
      </DrawerSection>

      {/* Related actions, both directions */}
      {related.length > 0 && (
        <DrawerSection
          title={t("drawer-relationships-title")}
          trailing={
            <MeedInfoTip
              content={t("drawer-relationships-note")}
              ariaLabel={t("drawer-relationships-note")}
            />
          }
        >
          <VStack alignItems="stretch" gap="m">
            {RELATED_ROLES.map((role) => {
              const items = related.filter((r) => r.role === role);
              if (items.length === 0) return null;
              return (
                <VStack key={role} alignItems="stretch" gap="s">
                  <Overline color="content.tertiary">
                    {t(`role-${role}`)}
                  </Overline>
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap="m">
                    {items.map(({ action: other, rationale }) => (
                      <ActionMiniCard
                        key={other.id}
                        action={other}
                        lng={lng}
                        rank={rankOf(other.id)}
                        note={pick(rationale, lng)}
                        tag={
                          rankOf(other.id) ? null : (
                            <MeedStatusTag tone="neutral">
                              {t("drawer-not-ranked-tag")}
                            </MeedStatusTag>
                          )
                        }
                        onOpen={() => onOpenAction(other.id)}
                        t={t}
                      />
                    ))}
                  </SimpleGrid>
                </VStack>
              );
            })}
          </VStack>
        </DrawerSection>
      )}

      {/* Legal */}
      <DrawerSection title={t("drawer-legal-title")}>
        <HStack gap="s" flexWrap="wrap" alignItems="center">
          <MeedStatusTag tone={GRADE_TONE[grade]}>
            {pick(GRADE_LABEL[grade], lng)}
          </MeedStatusTag>
          <BodyMedium color="content.secondary">
            {t("drawer-legal-line", {
              score: action.legal.score.toFixed(1),
              level: pick(LEVEL_LABEL[action.legal.responsibleLevel], lng),
              norms: action.legal.norms.length,
            })}
          </BodyMedium>
        </HStack>
        <Link
          asChild
          color="content.link"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          alignSelf="flex-start"
          _focusVisible={FOCUS_RING}
        >
          <NextLink href={legalHref}>{t("drawer-legal-link")}</NextLink>
        </Link>
      </DrawerSection>

      {/* Funding */}
      <DrawerSection
        title={t("drawer-funding-title")}
        tag={
          <MeedStatusTag
            tone={
              funding.gap === "self_deliverable" ||
              funding.gap === "credit_available"
                ? "positive"
                : funding.gap === "needs_technical_assistance"
                  ? "warning"
                  : "info"
            }
          >
            {pick(GAP_LABEL[funding.gap], lng)}
          </MeedStatusTag>
        }
      >
        <BodyMedium color="content.secondary">
          {pick(GAP_MEANING[funding.gap], lng)}
        </BodyMedium>
        {funding.ifCreditNotIndicated && (
          <BodySmall color="content.tertiary">
            {t("drawer-funding-verify", {
              alt: pick(GAP_LABEL[funding.ifCreditNotIndicated], lng),
            })}
          </BodySmall>
        )}
        <VStack
          alignItems="stretch"
          gap="0"
          borderWidth="1px"
          borderColor="border.overlay"
          borderRadius="rounded"
          overflow="hidden"
        >
          {action.pathways.map((key, i) => {
            const pathway = PATHWAY_BY_KEY[key];
            const gate = !pathway.creditGated
              ? { tone: "positive" as const, label: t("drawer-gate-open") }
              : funding.credit === "available"
                ? { tone: "positive" as const, label: t("drawer-gate-ready") }
                : funding.credit === "to_verify"
                  ? { tone: "warning" as const, label: t("drawer-gate-verify") }
                  : {
                      tone: "neutral" as const,
                      label: t("drawer-gate-blocked"),
                    };
            return (
              <HStack
                key={key}
                justifyContent="space-between"
                alignItems="flex-start"
                gap="m"
                px="m"
                py="m"
                borderTopWidth={i === 0 ? 0 : "1px"}
                borderColor="border.overlay"
              >
                <VStack alignItems="flex-start" gap="xs" minW={0}>
                  <LabelMedium color="content.primary">
                    {pick(pathway.label, lng)}
                  </LabelMedium>
                  <BodySmall color="content.secondary">
                    {pick(pathway.access, lng)}
                  </BodySmall>
                </VStack>
                <MeedStatusTag tone={gate.tone}>{gate.label}</MeedStatusTag>
              </HStack>
            );
          })}
        </VStack>
        <BodySmall color="content.tertiary">
          {t("drawer-funding-cost", { cost: t(`cost-${action.costBand}`) })} ·{" "}
          {t("drawer-funding-note")}
        </BodySmall>
      </DrawerSection>

      {/* Co-benefits already inside the Impact score */}
      {suppressed.length > 0 && (
        <DrawerSection
          title={t("drawer-suppressed-title")}
          trailing={
            <MeedInfoTip
              content={t("drawer-suppressed-body")}
              ariaLabel={t("drawer-suppressed-body")}
            />
          }
        >
          <HStack gap="s" flexWrap="wrap">
            {suppressed.map(({ key, cell }) => (
              <MeedStatusTag key={key} tone="negative">
                {t("drawer-suppressed-via", {
                  label: pick(CO_BENEFIT_LABEL[key], lng),
                  cell: pick(RISK_CELL_BY_KEY[cell].label, lng),
                })}
              </MeedStatusTag>
            ))}
          </HStack>
        </DrawerSection>
      )}

      {/* Provenance and fallbacks */}
      <DrawerSection title={t("drawer-provenance-title")}>
        <VStack alignItems="stretch" gap="s">
          {scored?.fallbacks.map((key) => (
            <HStack key={key} gap="s" alignItems="flex-start">
              <Icon as={LuInfo} boxSize="14px" color="content.link" mt="3px" />
              <BodyMedium color="content.secondary">
                {t(`fallback-${key}`)}
              </BodyMedium>
            </HStack>
          ))}
          <Caption color="content.tertiary">
            {t("drawer-source-line", {
              source: action.source.toUpperCase(),
              id: action.id,
            })}
          </Caption>
        </VStack>
      </DrawerSection>
    </>
  );
}

export const TONE_BY_SCORE = (v: number): MeedTone =>
  v >= 0.7 ? "positive" : v >= 0.4 ? "warning" : "neutral";
