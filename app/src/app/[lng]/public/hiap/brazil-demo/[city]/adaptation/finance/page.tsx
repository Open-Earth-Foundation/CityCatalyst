"use client";
import React from "react";
import { Card, HStack, SimpleGrid, Table, VStack } from "@chakra-ui/react";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import {
  creditScreen,
  CREDIT_LABEL,
  formatBrl,
  fundingResult,
  GAP_LABEL,
  GAP_MEANING,
  PATHWAYS,
  pushBucket,
  PUSH_LABEL,
  TIER_SCORE,
  type FundingGap,
  type FundingTier,
} from "../../../_lib/finance";
import { pick } from "../../../_lib/localized";

const TIER_TONE: Record<FundingTier, MeedTone> = {
  T1: "positive",
  T2: "info",
  T3: "warning",
  T4: "caution",
};

const GAP_TONE: Record<FundingGap, MeedTone> = {
  self_deliverable: "positive",
  credit_available: "positive",
  needs_technical_assistance: "warning",
  needs_cofinance: "info",
  needs_cofinance_and_ta: "neutral",
};

/** BR-A8 — financing feasibility, laid out so the city profile can become flags-only. */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const credit = creditScreen(city.capag);
  const bucket = pushBucket(city.financePush);
  const rows = ADAPTATION_ACTIONS.filter((a) => a.kind === "direct").map(
    (a) => ({ a, f: fundingResult(a, city) }),
  );
  const creditTone: MeedTone =
    credit === "available"
      ? "positive"
      : credit === "to_verify"
        ? "warning"
        : "neutral";

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="finance"
      screenId={SCREEN_IDS.adaptation.finance}
      title={t("finance-title")}
      description={t("finance-intro")}
      backLabel={t("back-to-home")}
      openPoints={[t("open-finance-profile"), t("open-finance-tiers")]}
    >
      {/* City profile — under review (Sep 16, see the corner notice): flags only. */}
      <Card.Root borderColor="border.neutral">
        <Card.Body p="l">
          <VStack alignItems="stretch" gap="m">
            <HStack gap="s" alignItems="center" flexWrap="wrap">
              <TitleMedium color="content.primary">
                {t("finance-profile-title", { city: city.name })}
              </TitleMedium>
              <MeedStatusTag tone="warning" ml="auto">
                {t("finance-profile-review-tag")}
              </MeedStatusTag>
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap="m">
              <VStack alignItems="stretch" gap="s">
                <Overline color="content.tertiary">
                  {t("finance-credit-label")}
                </Overline>
                <HStack gap="s" flexWrap="wrap">
                  <MeedStatusTag tone={creditTone}>
                    {pick(CREDIT_LABEL[credit], lng)}
                  </MeedStatusTag>
                  <BodySmall color="content.tertiary">
                    {t("finance-capag-line", {
                      grade: city.capag === "nd" ? "n.d." : city.capag,
                    })}
                  </BodySmall>
                </HStack>
                <BodySmall color="content.tertiary">
                  {t(
                    credit === "to_verify"
                      ? "finance-credit-verify-note"
                      : "finance-credit-note",
                  )}
                </BodySmall>
              </VStack>
              <VStack alignItems="stretch" gap="s">
                <Overline color="content.tertiary">
                  {t("finance-push-label")}
                </Overline>
                <MeedMeter
                  value={city.financePush / 14}
                  tone={city.financePush >= 7 ? "positive" : "warning"}
                  valueText={`${city.financePush} / 14`}
                  label={pick(PUSH_LABEL[bucket], lng)}
                />
                <BodySmall color="content.tertiary">
                  {t("finance-push-note")}
                </BodySmall>
              </VStack>
            </SimpleGrid>
          </VStack>
        </Card.Body>
      </Card.Root>

      {/* Funding gap per action */}
      <Card.Root overflow="hidden" borderColor="border.neutral">
        <HStack
          px="l"
          py="m"
          gap="m"
          alignItems="flex-start"
          justifyContent="space-between"
          borderBottomWidth="1px"
          borderColor="border.overlay"
          flexWrap="wrap"
        >
          <VStack alignItems="flex-start" gap="xs">
            <TitleMedium color="content.primary">
              {t("finance-table-title")}
            </TitleMedium>
            <BodyMedium color="content.secondary">
              {t("finance-table-description")}
            </BodyMedium>
          </VStack>
          <MeedStatusTag tone="warning">
            {t("finance-tier-pending")}
          </MeedStatusTag>
        </HStack>
        <Table.Root size="md">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("finance-col-action")}</Table.ColumnHeader>
              <Table.ColumnHeader display={{ base: "none", md: "table-cell" }}>
                {t("finance-col-cost")}
              </Table.ColumnHeader>
              <Table.ColumnHeader>{t("finance-col-gap")}</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("finance-col-tier")}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(({ a, f }) => (
              <Table.Row key={a.id}>
                <Table.Cell>
                  <BodyMedium color="content.primary" fontWeight="semibold">
                    {pick(a.name, lng)}
                  </BodyMedium>
                  <Caption color="content.tertiary">
                    {a.pathways
                      .map((k) =>
                        pick(PATHWAYS.find((p) => p.key === k)!.label, lng),
                      )
                      .join(" · ")}
                  </Caption>
                </Table.Cell>
                <Table.Cell display={{ base: "none", md: "table-cell" }}>
                  <BodySmall color="content.secondary">
                    {t(`cost-${a.costBand}`)} ·{" "}
                    {t(`prep-${a.preparationComplexity}`)}
                  </BodySmall>
                </Table.Cell>
                <Table.Cell>
                  <VStack alignItems="flex-start" gap="xs">
                    <MeedStatusTag tone={GAP_TONE[f.gap]}>
                      {pick(GAP_LABEL[f.gap], lng)}
                    </MeedStatusTag>
                    {f.ifCreditNotIndicated && (
                      <Caption color="content.tertiary">
                        {t("drawer-funding-verify", {
                          alt: pick(GAP_LABEL[f.ifCreditNotIndicated], lng),
                        })}
                      </Caption>
                    )}
                  </VStack>
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <HStack justifyContent="flex-end" gap="s">
                    <MeedStatusTag tone={TIER_TONE[f.tier]}>
                      {f.tier}
                    </MeedStatusTag>
                    <LabelLarge
                      color="content.primary"
                      fontVariantNumeric="tabular-nums"
                    >
                      {TIER_SCORE[f.tier].toFixed(2)}
                    </LabelLarge>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>

      {/* What the labels mean */}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="m">
        {(Object.keys(GAP_LABEL) as FundingGap[]).map((gap) => (
          <Card.Root key={gap} borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="flex-start" gap="s">
                <MeedStatusTag tone={GAP_TONE[gap]}>
                  {pick(GAP_LABEL[gap], lng)}
                </MeedStatusTag>
                <BodyMedium color="content.secondary">
                  {pick(GAP_MEANING[gap], lng)}
                </BodyMedium>
              </VStack>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>

      {/* Pathways */}
      <VStack alignItems="stretch" gap="m">
        <TitleMedium color="content.primary">
          {t("finance-pathways-title")}
        </TitleMedium>
        <Card.Root overflow="hidden" borderColor="border.neutral">
          <Table.Root size="md">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>
                  {t("finance-col-pathway")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("finance-col-access")}
                </Table.ColumnHeader>
                <Table.ColumnHeader w="140px">
                  {t("finance-col-gate")}
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {PATHWAYS.map((p) => (
                <Table.Row key={p.key}>
                  <Table.Cell>
                    <LabelMedium color="content.primary">
                      {pick(p.label, lng)}
                    </LabelMedium>
                  </Table.Cell>
                  <Table.Cell>
                    <BodySmall color="content.secondary">
                      {pick(p.access, lng)}
                    </BodySmall>
                  </Table.Cell>
                  <Table.Cell>
                    {p.creditGated ? (
                      <MeedStatusTag
                        tone={
                          credit === "available"
                            ? "positive"
                            : credit === "to_verify"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {t("finance-gate-credit")}
                      </MeedStatusTag>
                    ) : (
                      <MeedStatusTag tone="positive">
                        {t("finance-gate-open")}
                      </MeedStatusTag>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card.Root>
      </VStack>

      {/* Comparable projects */}
      <VStack alignItems="stretch" gap="m">
        <VStack alignItems="stretch" gap="xs">
          <TitleMedium color="content.primary">
            {t("finance-projects-title")}
          </TitleMedium>
          <BodyMedium color="content.secondary">
            {t("finance-projects-description")}
          </BodyMedium>
        </VStack>
        <Card.Root overflow="hidden" borderColor="border.neutral">
          <Table.Root size="md">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>
                  {t("finance-col-project")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("finance-col-channel")}
                </Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">
                  {t("finance-col-amount")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("finance-col-stage")}
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {ADAPTATION_ACTIONS.flatMap((a) =>
                a.comparableProjects.map((p) => ({ a, p })),
              ).map(({ a, p }, i) => (
                <Table.Row key={i}>
                  <Table.Cell>
                    <LabelMedium color="content.primary">{p.name}</LabelMedium>
                    <Caption color="content.tertiary">
                      {p.city} · {pick(a.name, lng)}
                    </Caption>
                  </Table.Cell>
                  <Table.Cell>
                    <BodySmall color="content.secondary">
                      {pick(p.channel, lng)}
                    </BodySmall>
                    <Caption color="content.tertiary">
                      {pick(p.instrument, lng)}
                    </Caption>
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    <BodySmall
                      color="content.primary"
                      fontVariantNumeric="tabular-nums"
                    >
                      {formatBrl(p.amountBrl, lng)}
                    </BodySmall>
                  </Table.Cell>
                  <Table.Cell>
                    <MeedStatusTag tone="neutral">
                      {pick(p.stage, lng)}
                    </MeedStatusTag>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card.Root>
        <BodySmall color="content.tertiary">
          {t("finance-projects-note")}
        </BodySmall>
      </VStack>
    </DemoShell>
  );
}
