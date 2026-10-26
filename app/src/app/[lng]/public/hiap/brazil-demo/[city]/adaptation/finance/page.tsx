"use client";
import React, { useState } from "react";
import { Box, Card, HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { MeedShareBar } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedShareBar";
import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT, useTrackT } from "../../../_lib/useDemoT";
import { useLabels } from "../../../_lib/useLabels";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import {
  creditScreen,
  formatBrl,
  fundingResult,
  GAP_LABEL,
  GAP_MEANING,
  isPushStrong,
  PATHWAY_BY_KEY,
  PATHWAYS,
  pushBucket,
  type CreditScreen,
  type FundingGap,
  type FundingResult,
  type PathwayMeta,
} from "../../../_lib/finance";
import { CAPAG_INFO_URL, PEF_INFO_URL } from "../../../_lib/links";
import { ADAPTA_SECTORS, SECTOR_LABEL } from "../../../_lib/riskCells";
import { downloadCsv } from "../../../_lib/csv";
import { pick } from "../../../_lib/localized";
import type { AdaptationAction } from "../../../_lib/types";
import { Level } from "../../../_components/next/Level";
import { SectorGlyph } from "../../../_components/next/SectorIcon";
import { TextLink } from "../../../_components/next/TextLink";
import { COST_TONE, GAP_TONE } from "../../../_components/next/rows";
import {
  ExpandableRow,
  RowList,
} from "../../../_components/next/ExpandableRow";
import {
  ExportCsvButton,
  FacetFilters,
  useLocationHash,
  useUrlSelection,
} from "../../../_components/next/ListControls";
import { matchesFacets, type Facet } from "../../../_components/next/facets";

const CREDIT_TONE: Record<CreditScreen, MeedTone> = {
  available: "positive",
  to_verify: "warning",
  not_indicated: "negative",
};

/** The three funding bins of the list's filter, same split as their colours. */
const BIN: Record<FundingGap, "self" | "support" | "both"> = {
  self_deliverable: "self",
  credit_available: "self",
  needs_technical_assistance: "support",
  needs_cofinance: "support",
  needs_cofinance_and_ta: "both",
};

interface FinanceRow {
  a: AdaptationAction;
  f: FundingResult;
}

/**
 * BR-N8 — financing feasibility. CAPAG first, with what it is, why it
 * matters and where to improve it (finance review, Oct 2026); then the
 * financing routes in general, not tied to an action; then one row per
 * action, as the methodology sets it (§5.2.6), that opens on what its gap
 * means, the routes that fit it and comparable projects. No tier scores.
 */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const tResults = useTrackT(lng, "adaptation", "meed-results");
  const labels = useLabels(lng, "adaptation");
  // A deep link (#<id>, e.g. from the action drawer) opens its row.
  const hash = useLocationHash();
  const [openState, setOpen] = useState<string | null | undefined>(undefined);
  const open = openState === undefined ? hash || null : openState;
  const [selected, setSelected] = useUrlSelection([
    "sector",
    "funding",
    "cost",
  ]);

  const credit = creditScreen(city.capag);
  // Whether a route is open to this city: credit routes follow CAPAG.
  const gate = (p: PathwayMeta) => (
    <Level tone={p.creditGated ? CREDIT_TONE[credit] : "positive"}>
      {p.creditGated ? t(`next-gate-credit-${credit}`) : t("next-gate-open")}
    </Level>
  );
  const pushStrong = isPushStrong(city.financePush);
  const rows: FinanceRow[] = ADAPTATION_ACTIONS.filter(
    (a) => a.kind === "direct",
  ).map((a) => ({ a, f: fundingResult(a, city) }));

  const facets: Facet<FinanceRow>[] = [
    {
      key: "sector",
      title: t("next-filter-sectors"),
      options: ADAPTA_SECTORS.map((k) => ({
        value: k,
        label: labels.sector(k),
      })),
      values: (r) => [r.a.sector],
      chip: (o) => o.label,
    },
    {
      key: "funding",
      title: t("next-filter-funding"),
      options: ["self", "support", "both"].map((k) => ({
        value: k,
        label: t(`next-funding-bin-${k}`),
      })),
      values: (r) => [BIN[r.f.gap]],
    },
    {
      key: "cost",
      title: t("next-filter-cost"),
      options: ["low", "medium", "high"].map((k) => ({
        value: k,
        label: t(`next-cost-${k}`),
      })),
      values: (r) => [r.a.costBand],
      chip: (o) => o.label,
    },
  ];
  const visible = rows.filter((r) => matchesFacets(r, facets, selected));
  const binCount = (b: "self" | "support" | "both") =>
    visible.filter((r) => BIN[r.f.gap] === b).length;

  const exportCsv = () =>
    downloadCsv(
      `hiap-brazil-demo-${city.slug}-finance.csv`,
      [
        t("finance-col-action"),
        t("next-col-sector"),
        t("next-col-cost"),
        t("next-finance-col-preparation"),
        t("next-col-funding"),
        t("finance-pathways-title"),
      ],
      visible.map(({ a, f }) => [
        pick(a.name, lng),
        pick(SECTOR_LABEL[a.sector], lng),
        t(`next-cost-${a.costBand}`),
        t(`prep-${a.preparationComplexity}`),
        pick(GAP_LABEL[f.gap], lng),
        a.pathways.map((k) => pick(PATHWAY_BY_KEY[k].label, lng)).join("; "),
      ]),
    );

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="finance"
      screenId={SCREEN_IDS.next.finance}
      title={t("finance-title")}
      description={t("next-finance-intro", { city: city.name })}
      backLabel={t("back-to-home")}
      openPoints={[
        t("next-notice-proposal"),
        t("next-notice-finance-level"),
        t("next-notice-finance-categories"),
        t("next-notice-finance-tiers"),
      ]}
    >
      {/* CAPAG first: the rating that opens or closes credit. */}
      <Card.Root borderColor="border.overlay" id="capag" scrollMarginTop="96px">
        <Card.Body p="l">
          <SimpleGrid columns={{ base: 1, lg: 3 }} gap="xl">
            <VStack
              alignItems="stretch"
              gap="m"
              gridColumn={{ base: "auto", lg: "span 2" }}
            >
              <Overline color="content.tertiary">
                {t("next-capag-eyebrow")}
              </Overline>
              <HStack gap="l" alignItems="center" flexWrap="wrap">
                <TitleLarge color="content.primary">
                  {city.capag === "nd"
                    ? t("next-capag-grade-nd")
                    : t("next-capag-grade", { grade: city.capag })}
                </TitleLarge>
                <Level tone={CREDIT_TONE[credit]}>
                  {t(`next-credit-${credit}`)}
                </Level>
              </HStack>
              <BodySmall color="content.tertiary">
                {t(
                  city.capag === "nd"
                    ? "next-capag-source-nd"
                    : "next-capag-source",
                )}
              </BodySmall>
              <BodyMedium color="content.secondary">
                {t("next-capag-what")}
              </BodyMedium>
              <BodyMedium color="content.secondary">
                {t("next-capag-why")}
              </BodyMedium>
              {credit === "to_verify" && (
                <BodyMedium color="content.secondary">
                  {t("next-capag-nd", { city: city.name })}
                </BodyMedium>
              )}
              <HStack gap="xl" flexWrap="wrap">
                <TextLink href={CAPAG_INFO_URL} external>
                  {t("next-capag-link-capag")}
                </TextLink>
                <TextLink href={PEF_INFO_URL} external>
                  {t("next-capag-link-pef")}
                </TextLink>
              </HStack>
            </VStack>
            <VStack
              alignItems="stretch"
              gap="xs"
              pt={{ base: "l", lg: "0" }}
              pl={{ base: "0", lg: "xl" }}
              borderTopWidth={{ base: "1px", lg: "0" }}
              borderLeftWidth={{ base: "0", lg: "1px" }}
              borderColor="border.overlay"
            >
              <Level
                tone={pushStrong ? "positive" : "warning"}
                label={t("next-finance-push-label")}
                info={t("finance-push-note")}
              >
                {t(`next-push-${pushBucket(city.financePush)}`)}
              </Level>
              <BodySmall color="content.tertiary">
                {t("next-finance-push-source")}
              </BodySmall>
            </VStack>
          </SimpleGrid>
        </Card.Body>
      </Card.Root>

      {/* The routes in general, not tied to an action: they combine. */}
      <VStack alignItems="stretch" gap="m" id="options" scrollMarginTop="96px">
        <VStack alignItems="flex-start" gap="xs">
          <TitleLarge color="content.primary">
            {t("next-options-title", { city: city.name })}
          </TitleLarge>
          <BodySmall color="content.secondary">
            {t("next-options-intro")}
          </BodySmall>
        </VStack>
        <SimpleGrid
          columns={{ base: 1, md: 2, xl: 3 }}
          gap="m"
          data-testid="financing-options"
        >
          {PATHWAYS.map((p) => (
            <VStack
              key={p.key}
              alignItems="stretch"
              gap="s"
              p="l"
              bg="base.light"
              borderWidth="1px"
              borderColor="border.neutral"
              borderRadius="rounded"
              boxShadow="1dp"
            >
              <TitleMedium as="h3" color="content.primary">
                {pick(p.label, lng)}
              </TitleMedium>
              <BodySmall color="content.secondary">
                {pick(p.access, lng)}
              </BodySmall>
              {p.key === "federal_transfer" && (
                <BodySmall color="content.secondary">
                  {t("next-pathway-note-federal_transfer")}
                </BodySmall>
              )}
              {p.creditGated && (
                <BodySmall color="content.secondary">
                  {t("next-pathway-note-credit")}
                </BodySmall>
              )}
              <Box flex="1" />
              {gate(p)}
            </VStack>
          ))}
        </SimpleGrid>
      </VStack>

      <VStack alignItems="stretch" gap="m">
        <HStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="m"
          flexWrap="wrap"
        >
          <VStack alignItems="flex-start" gap="xs">
            <TitleLarge color="content.primary">
              {t("finance-table-title")}
            </TitleLarge>
            <BodySmall color="content.secondary">
              {t("next-finance-rows", { count: visible.length })}
            </BodySmall>
            <BodySmall color="content.tertiary">
              {t("next-finance-scope")}
            </BodySmall>
          </VStack>
          <ExportCsvButton onClick={exportCsv} t={t} />
        </HStack>

        <FacetFilters
          items={rows}
          facets={facets}
          selected={selected}
          onChange={setSelected}
          t={t}
        />

        <Box>
          <MeedShareBar
            segments={[
              {
                label: t("next-funding-bin-self"),
                value: binCount("self"),
                color: "interactive.tertiary",
              },
              {
                label: t("next-funding-bin-support"),
                value: binCount("support"),
                color: "sentiment.warningDefault",
              },
              {
                label: t("next-funding-bin-both"),
                value: binCount("both"),
                color: "sentiment.negativeDefault",
              },
            ]}
            formatValue={(s) => t("next-actions-count", { count: s.value })}
            ariaLabel={t("finance-table-title")}
            tipTitle={t("finance-table-title")}
            t={tResults}
          />
        </Box>

        <RowList>
          {visible.map(({ a, f }) => (
            <ExpandableRow
              key={a.id}
              id={a.id}
              open={open === a.id}
              onOpenChange={(o) => setOpen(o ? a.id : null)}
              title={pick(a.name, lng)}
              meta={
                <>
                  <SectorGlyph sector={a.sector} size="12px" />{" "}
                  {pick(SECTOR_LABEL[a.sector], lng)} ·{" "}
                  {t(`prep-${a.preparationComplexity}`)}
                </>
              }
              aside={
                <>
                  <Level tone={COST_TONE[a.costBand]}>
                    {t(`next-cost-${a.costBand}`)}
                  </Level>
                  <Level tone={GAP_TONE[f.gap]}>
                    {pick(GAP_LABEL[f.gap], lng)}
                  </Level>
                </>
              }
            >
              <SimpleGrid columns={{ base: 1, lg: 3 }} gap="xl">
                <VStack alignItems="stretch" gap="s">
                  <Overline color="content.tertiary">
                    {t("next-finance-gap-means")}
                  </Overline>
                  <BodyMedium color="content.secondary">
                    {pick(GAP_MEANING[f.gap], lng)}
                  </BodyMedium>
                  {f.ifCreditNotIndicated && (
                    <BodySmall color="content.secondary">
                      {t("drawer-funding-verify", {
                        alt: pick(GAP_LABEL[f.ifCreditNotIndicated], lng),
                      })}
                    </BodySmall>
                  )}
                </VStack>
                <VStack alignItems="stretch" gap="m">
                  <Overline color="content.tertiary">
                    {t("next-finance-pathways")}
                  </Overline>
                  {a.pathways.map((k) => {
                    const p = PATHWAY_BY_KEY[k];
                    return (
                      <VStack key={k} alignItems="stretch" gap="xs">
                        <BodyMedium
                          color="content.primary"
                          fontWeight="semibold"
                        >
                          {pick(p.label, lng)}
                        </BodyMedium>
                        {gate(p)}
                      </VStack>
                    );
                  })}
                  <TextLink href="#options">
                    {t("next-finance-options-link")}
                  </TextLink>
                </VStack>
                <VStack alignItems="stretch" gap="m">
                  <Overline color="content.tertiary">
                    {t("finance-projects-title")}
                  </Overline>
                  {a.comparableProjects.length === 0 ? (
                    <BodySmall color="content.secondary">
                      {t("next-finance-no-projects")}
                    </BodySmall>
                  ) : (
                    a.comparableProjects.map((p, i) => (
                      <VStack
                        key={`${p.name}-${i}`}
                        alignItems="stretch"
                        gap="xs"
                      >
                        <BodyMedium
                          color="content.primary"
                          fontWeight="semibold"
                        >
                          {p.name}
                        </BodyMedium>
                        <BodySmall color="content.secondary">
                          {p.city} · {pick(p.channel, lng)} ·{" "}
                          {pick(p.instrument, lng)}
                        </BodySmall>
                        <BodySmall color="content.tertiary">
                          {formatBrl(p.amountBrl, lng)} · {pick(p.stage, lng)}
                        </BodySmall>
                      </VStack>
                    ))
                  )}
                </VStack>
              </SimpleGrid>
            </ExpandableRow>
          ))}
        </RowList>
        <BodySmall color="content.tertiary">
          {t("finance-projects-note")}
        </BodySmall>
      </VStack>
    </DemoShell>
  );
}
