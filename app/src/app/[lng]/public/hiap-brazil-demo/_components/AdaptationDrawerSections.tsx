"use client";
import React from "react";
import { Box, HStack, Icon, Link, Table, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { AdaptationAction, CityFixture, DemoTrack } from "../_lib/types";
import type { ScoredAction } from "../_lib/ranking";
import { componentScore } from "../_lib/ranking";
import { ACTION_BY_ID } from "../_lib/actions";
import { RISK_CELL_BY_KEY, UNCOVERED_HAZARD_LABEL } from "../_lib/riskCells";
import { pick } from "../_lib/localized";
import {
  GRADE_LABEL,
  GRADE_TONE,
  LEVEL_LABEL,
  legalGrade,
} from "../_lib/legal";
import { fundingResult, GAP_LABEL, PATHWAY_BY_KEY } from "../_lib/finance";
import { suppressedCoBenefits, CO_BENEFIT_LABEL } from "../_lib/coBenefits";
import { trackHref } from "../_lib/hrefs";

function Section({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <VStack alignItems="stretch" gap="m">
      <HStack gap="s" alignItems="center" flexWrap="wrap">
        <LabelLarge color="content.primary">{title}</LabelLarge>
        {tag}
      </HStack>
      {children}
    </VStack>
  );
}

function Provenance({ ok, label }: { ok: boolean; label: string }) {
  return (
    <MeedStatusTag tone={ok ? "positive" : "warning"}>{label}</MeedStatusTag>
  );
}

/**
 * The adaptation-specific half of the action drawer — what the shared
 * `DetailPanel` cannot know: which risk cells the action credits and how,
 * its relationships to other actions, the legal grade, the funding label,
 * and where the score relied on a placeholder or a fallback. Methodology §7
 * and §8 make every one of these a per-action transparency commitment.
 */
export function AdaptationDrawerSections({
  action,
  scored,
  city,
  lng,
  t,
  onOpenAction,
}: {
  action: AdaptationAction;
  scored: ScoredAction | null;
  city: CityFixture;
  lng: string;
  t: TFunction;
  onOpenAction: (id: string) => void;
}) {
  const track: DemoTrack = "adaptation";
  const grade = legalGrade(action.legal.score);
  const funding = fundingResult(action, city);
  const suppressed = suppressedCoBenefits(action);
  const directLinks = action.links.filter((l) => l.directness === "direct");
  const otherLinks = action.links.filter((l) => l.directness !== "direct");

  return (
    <>
      {/* Risk cells credited */}
      <Section
        title={t("drawer-risk-title")}
        tag={
          <Provenance
            ok={action.provenance.linksReviewed}
            label={t(
              action.provenance.linksReviewed
                ? "prov-reviewed"
                : "prov-proposed",
            )}
          />
        }
      >
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
          <Table.Root size="md">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>{t("drawer-col-cell")}</Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("drawer-col-component")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("drawer-col-effect")}
                </Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">
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
                      <BodySmall color="content.primary" fontWeight="semibold">
                        {pick(cell.label, lng)}
                      </BodySmall>
                    </Table.Cell>
                    <Table.Cell>
                      <BodySmall color="content.secondary">
                        {t(`component-${link.component}`)}
                      </BodySmall>
                    </Table.Cell>
                    <Table.Cell>
                      <VStack alignItems="flex-start" gap="xs">
                        <BodySmall color="content.secondary">
                          {t("drawer-effect-line", {
                            effectiveness: t(
                              `effectiveness-${link.effectiveness}`,
                            ),
                            confidence: t(`confidence-${link.confidence}`),
                            score: componentScore(link, action).toFixed(2),
                          })}
                        </BodySmall>
                        {link.maladaptation && (
                          <MeedStatusTag tone="warning">
                            {t("drawer-maladaptation-tag")}
                          </MeedStatusTag>
                        )}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      <BodySmall
                        color={
                          cityIndex === 0
                            ? "sentiment.negativeDefault"
                            : "content.primary"
                        }
                        fontVariantNumeric="tabular-nums"
                      >
                        {cityIndex === null ? "—" : cityIndex.toFixed(2)}
                      </BodySmall>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
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
      </Section>

      {/* Relationships (display only) */}
      {action.relationships.length > 0 && (
        <Section
          title={t("drawer-relationships-title")}
          tag={
            <MeedStatusTag tone="neutral">
              {t("drawer-not-scored")}
            </MeedStatusTag>
          }
        >
          <VStack alignItems="stretch" gap="s">
            {action.relationships.map((rel) => {
              const other = ACTION_BY_ID[rel.actionId];
              if (!other) return null;
              return (
                <HStack
                  key={`${rel.kind}-${rel.actionId}`}
                  gap="s"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <HStack gap="s" minW={0}>
                    <MeedStatusTag tone="info">
                      {t(`rel-${rel.kind}`)}
                    </MeedStatusTag>
                    <Link
                      as="button"
                      color="content.link"
                      fontFamily="heading"
                      fontSize="label.md"
                      fontWeight="semibold"
                      textAlign="start"
                      onClick={() => onOpenAction(other.id)}
                      _focusVisible={FOCUS_RING}
                    >
                      {pick(other.name, lng)}
                    </Link>
                  </HStack>
                </HStack>
              );
            })}
          </VStack>
          <BodySmall color="content.tertiary">
            {t("drawer-relationships-note")}
          </BodySmall>
        </Section>
      )}

      {/* Legal */}
      <Section
        title={t("drawer-legal-title")}
        tag={
          <Provenance
            ok={action.provenance.legalReviewed}
            label={t(
              action.provenance.legalReviewed
                ? "prov-icare"
                : "prov-placeholder",
            )}
          />
        }
      >
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
          <NextLink
            href={`${trackHref(lng, city.slug, track, "legal")}#${action.id}`}
          >
            {t("drawer-legal-link")}
          </NextLink>
        </Link>
      </Section>

      {/* Funding */}
      <Section title={t("drawer-funding-title")}>
        <VStack alignItems="stretch" gap="s">
          <LabelMedium color="content.primary">
            {pick(GAP_LABEL[funding.gap], lng)}
          </LabelMedium>
          {funding.ifCreditNotIndicated && (
            <BodySmall color="content.tertiary">
              {t("drawer-funding-verify", {
                alt: pick(GAP_LABEL[funding.ifCreditNotIndicated], lng),
              })}
            </BodySmall>
          )}
          <HStack gap="xs" flexWrap="wrap">
            {action.pathways.map((key) => (
              <MeedStatusTag
                key={key}
                tone={
                  PATHWAY_BY_KEY[key].creditGated &&
                  funding.credit !== "available"
                    ? "neutral"
                    : "info"
                }
              >
                {pick(PATHWAY_BY_KEY[key].label, lng)}
              </MeedStatusTag>
            ))}
          </HStack>
          <BodySmall color="content.tertiary">
            {t("drawer-funding-note", { cost: t(`cost-${action.costBand}`) })}
          </BodySmall>
        </VStack>
      </Section>

      {/* Co-benefit suppression */}
      {suppressed.length > 0 && (
        <Section title={t("drawer-suppressed-title")}>
          <HStack gap="xs" flexWrap="wrap">
            {suppressed.map((key) => (
              <MeedStatusTag
                key={key}
                tone="neutral"
                textDecoration="line-through"
              >
                {pick(CO_BENEFIT_LABEL[key], lng)}
              </MeedStatusTag>
            ))}
          </HStack>
          <BodySmall color="content.tertiary">
            {t("drawer-suppressed-body")}
          </BodySmall>
        </Section>
      )}

      {/* Provenance and fallbacks */}
      <Section title={t("drawer-provenance-title")}>
        <VStack alignItems="stretch" gap="s">
          {scored?.fallbacks.map((key) => (
            <HStack key={key} gap="s" alignItems="flex-start">
              <Icon as={LuInfo} boxSize="14px" color="content.link" mt="3px" />
              <BodyMedium color="content.secondary">
                {t(`fallback-${key}`)}
              </BodyMedium>
            </HStack>
          ))}
          {action.coBenefitsAiOnly && (
            <HStack gap="s" alignItems="flex-start">
              <Icon
                as={LuInfo}
                boxSize="14px"
                color="sentiment.warningDefault"
                mt="3px"
              />
              <BodyMedium color="content.secondary">
                {t("prov-cobenefits-ai")}
              </BodyMedium>
            </HStack>
          )}
          {!action.provenance.policyReviewed && (
            <HStack gap="s" alignItems="flex-start">
              <Icon
                as={LuInfo}
                boxSize="14px"
                color="sentiment.warningDefault"
                mt="3px"
              />
              <BodyMedium color="content.secondary">
                {t("prov-policy-unreviewed")}
              </BodyMedium>
            </HStack>
          )}
          <Box>
            <BodyMedium color="content.tertiary" fontSize="body.sm">
              {t("drawer-source-line", {
                source: action.source.toUpperCase(),
                id: action.id,
              })}
            </BodyMedium>
          </Box>
        </VStack>
      </Section>
    </>
  );
}

export const TONE_BY_SCORE = (v: number): MeedTone =>
  v >= 0.7 ? "positive" : v >= 0.4 ? "warning" : "neutral";
