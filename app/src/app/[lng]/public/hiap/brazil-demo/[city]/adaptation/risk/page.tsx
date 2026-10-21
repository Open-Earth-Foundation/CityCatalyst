"use client";
import React, { useMemo, useState } from "react";
import { Card, HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { MeedInfoTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedInfoTip";
import { DemoShell } from "../../../_components/DemoShell";
import { indexTone } from "../../../_components/RiskCellGrid";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { useLabels } from "../../../_lib/useLabels";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTABRASIL_URL } from "../../../_lib/links";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import {
  ADAPTA_SECTORS,
  RISK_CELLS,
  SECTOR_LABEL,
  UNCOVERED_HAZARD_LABEL,
} from "../../../_lib/riskCells";
import { downloadCsv } from "../../../_lib/csv";
import { pick } from "../../../_lib/localized";
import type { RiskCell, RiskReading } from "../../../_lib/types";
import { Level } from "../../../_components/next/Level";
import { LEVEL_TONE } from "../../../_components/next/rows";
import { SectorGlyph } from "../../../_components/next/SectorIcon";
import { TextLink } from "../../../_components/next/TextLink";
import {
  ExpandableRow,
  RowList,
} from "../../../_components/next/ExpandableRow";
import {
  ChoiceMenu,
  ExportCsvButton,
  FacetFilters,
  useUrlSelection,
} from "../../../_components/next/ListControls";
import { matchesFacets, type Facet } from "../../../_components/next/facets";

type Scenario = "today" | "2030" | "2050";
const SCENARIOS: Scenario[] = ["today", "2030", "2050"];
const COMPONENTS = ["hazard", "exposure", "vulnerability"] as const;
const LEVEL_OF_TONE: Record<string, string> = {
  negative: "high",
  warning: "medium",
  positive: "low",
};

interface HazardRow {
  cell: RiskCell;
  reading: RiskReading | null;
  index: number | null;
}

const indexFor = (r: RiskReading | null, s: Scenario) =>
  !r
    ? null
    : s === "today"
      ? r.index
      : s === "2030"
        ? r.index2030
        : r.index2050;

/**
 * BR-N2 — proposal: the city's AdaptaBrasil risk profile as one list,
 * highest risk first. Each hazard reads as a level in words with the index
 * beside it (the one number the proposal keeps, decision D7); opening a row
 * shows what drives the risk and which actions reduce it.
 */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const labels = useLabels(lng, "adaptation");
  const [scenario, setScenario] = useState<Scenario>("today");
  const fmt2 = (n: number) =>
    new Intl.NumberFormat(lng === "pt" ? "pt-BR" : "en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useUrlSelection(["sector", "level"]);

  const rows: HazardRow[] = useMemo(
    () =>
      RISK_CELLS.map((cell) => {
        const reading = city.risk[cell.key] ?? null;
        return { cell, reading, index: indexFor(reading, scenario) };
      }).sort((a, b) => (b.index ?? -1) - (a.index ?? -1)),
    [city, scenario],
  );

  const facets: Facet<HazardRow>[] = [
    {
      key: "sector",
      title: t("next-filter-sectors"),
      options: ADAPTA_SECTORS.map((k) => ({
        value: k,
        label: labels.sector(k),
      })),
      values: (r) => [r.cell.sector],
      chip: (o) => o.label,
    },
    {
      key: "level",
      title: t("next-filter-level"),
      options: ["high", "medium", "low"].map((v) => ({
        value: v,
        label: t(
          `risk-level-${v === "high" ? "negative" : v === "medium" ? "warning" : "positive"}`,
        ),
      })),
      values: (r) =>
        r.index === null ? [] : [LEVEL_OF_TONE[indexTone(r.index)]],
      chip: (o) => t(`next-risk-level-${LEVEL_TONE[o.value]}`),
    },
  ];
  const visible = rows.filter((r) => matchesFacets(r, facets, selected));

  const exportCsv = () => {
    const value = (n: number | undefined | null) =>
      n === undefined || n === null ? "" : n.toFixed(2);
    downloadCsv(
      `hiap-brazil-demo-${city.slug}-risk-${scenario}.csv`,
      [
        t("risk-col-cell"),
        t("next-col-sector"),
        t("risk-col-hazard"),
        t("risk-col-exposure"),
        t("risk-col-vulnerability"),
        t(`risk-col-index-${scenario}`),
      ],
      visible.map(({ cell, reading, index }) => [
        pick(cell.label, lng),
        pick(SECTOR_LABEL[cell.sector], lng),
        reading && cell.hasComponents ? value(reading.hazard) : "",
        reading && cell.hasComponents ? value(reading.exposure) : "",
        reading && cell.hasComponents ? value(reading.vulnerability) : "",
        value(index),
      ]),
    );
  };

  const uncovered = (
    Object.keys(
      UNCOVERED_HAZARD_LABEL,
    ) as (keyof typeof UNCOVERED_HAZARD_LABEL)[]
  ).map((h) => pick(UNCOVERED_HAZARD_LABEL[h], lng));

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="risk"
      screenId={SCREEN_IDS.next.risk}
      title={t("risk-title")}
      description={t("next-risk-intro", { city: city.name })}
      backLabel={t("back-to-home")}
      openPoints={[t("next-notice-proposal"), t("next-notice-risk")]}
    >
      <VStack alignItems="stretch" gap="m">
        <HStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="m"
          flexWrap="wrap"
        >
          <VStack alignItems="flex-start" gap="xs">
            <TitleLarge color="content.primary">
              {t("risk-table-title")}
            </TitleLarge>
            <BodySmall color="content.secondary">
              {t("next-risk-rows", { count: visible.length })}
            </BodySmall>
          </VStack>
          <HStack gap="l" alignItems="center" flexWrap="wrap">
            <ChoiceMenu
              label={t("next-scenario-label")}
              value={scenario}
              options={SCENARIOS.map((s) => ({
                value: s,
                label: t(`risk-scenario-${s}`),
              }))}
              onChange={setScenario}
            />
            <ExportCsvButton onClick={exportCsv} t={t} />
          </HStack>
        </HStack>

        <FacetFilters
          items={rows}
          facets={facets}
          selected={selected}
          onChange={setSelected}
          t={t}
        />

        {scenario !== "today" && (
          <BodySmall color="content.secondary">
            {t("risk-scenario-note")}
          </BodySmall>
        )}

        <RowList>
          {visible.map(({ cell, reading, index }) => {
            const tone = index === null ? "neutral" : indexTone(index);
            const reducedBy = ADAPTATION_ACTIONS.filter((a) =>
              a.links.some(
                (l) => l.cell === cell.key && l.directness === "direct",
              ),
            );
            return (
              <ExpandableRow
                key={cell.key}
                id={cell.key}
                open={open === cell.key}
                onOpenChange={(o) => setOpen(o ? cell.key : null)}
                title={
                  <HStack as="span" gap="s">
                    <SectorGlyph sector={cell.sector} size="16px" />
                    <span>{pick(cell.label, lng)}</span>
                  </HStack>
                }
                meta={`${pick(SECTOR_LABEL[cell.sector], lng)} · ${pick(cell.hazardLabel, lng)}`}
                aside={
                  index === null ? (
                    <Level tone="neutral">{t("risk-no-data")}</Level>
                  ) : (
                    <>
                      <Level tone={tone}>{t(`next-risk-level-${tone}`)}</Level>
                      <BodySmall
                        color="content.tertiary"
                        fontVariantNumeric="tabular-nums"
                        minW="72px"
                      >
                        {t("next-risk-index", { value: fmt2(index) })}
                      </BodySmall>
                    </>
                  )
                }
              >
                <SimpleGrid columns={{ base: 1, md: 2 }} gap="xl">
                  <VStack alignItems="stretch" gap="s">
                    <Overline color="content.tertiary">
                      {t("next-risk-drivers")}
                    </Overline>
                    {reading && cell.hasComponents ? (
                      COMPONENTS.map((c) => {
                        const v = reading[c];
                        const ct = indexTone(v);
                        return (
                          <HStack key={c} gap="xs" alignItems="center">
                            <BodySmall color="content.secondary" minW="96px">
                              {t(`risk-col-${c}`)}
                            </BodySmall>
                            <MeedInfoTip
                              content={t(`risk-tip-${c}`)}
                              ariaLabel={t(`risk-tip-${c}`)}
                            />
                            <Level tone={v === 0 ? "neutral" : ct}>
                              {t("next-component-value", {
                                level: t(`risk-level-${ct}`),
                                value: fmt2(v),
                              })}
                            </Level>
                          </HStack>
                        );
                      })
                    ) : (
                      <BodySmall color="content.secondary">
                        {t("risk-no-components")}
                      </BodySmall>
                    )}
                  </VStack>
                  <VStack alignItems="stretch" gap="s">
                    <Overline color="content.tertiary">
                      {t("next-risk-reduced-by")}
                    </Overline>
                    {reducedBy.length === 0 ? (
                      <BodySmall color="content.secondary">
                        {t("next-risk-reduced-none")}
                      </BodySmall>
                    ) : (
                      reducedBy.map((a) => (
                        <BodyMedium key={a.id} color="content.primary">
                          {pick(a.name, lng)}
                        </BodyMedium>
                      ))
                    )}
                  </VStack>
                </SimpleGrid>
              </ExpandableRow>
            );
          })}
        </RowList>
        <BodySmall color="content.tertiary">
          {t("next-risk-index-note")}
        </BodySmall>
      </VStack>

      <Card.Root borderColor="border.overlay">
        <Card.Body p="l">
          <VStack alignItems="stretch" gap="s">
            <TitleMedium as="h3" color="content.primary">
              {t("risk-not-covered-title")}
            </TitleMedium>
            <BodyMedium color="content.secondary">
              {t("next-risk-not-covered-body")}
            </BodyMedium>
            <BodySmall color="content.secondary">
              {[...uncovered, t("risk-not-covered-infra")].join(" · ")}
            </BodySmall>
            {city.coastal && (
              <BodySmall color="content.secondary">
                {t("next-risk-coastal-note", { city: city.name })}
              </BodySmall>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>

      <TextLink href={ADAPTABRASIL_URL} external>
        {t("risk-source-link")}
      </TextLink>
    </DemoShell>
  );
}
