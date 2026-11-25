"use client";
import React, { useState } from "react";
import { Card, HStack, Icon, Tabs, VStack } from "@chakra-ui/react";
import {
  LuDownload,
  LuExternalLink,
  LuInfo,
  LuMapPinOff,
} from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { Link } from "@chakra-ui/react";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { DemoShell } from "../../../../_components/DemoShell";
import {
  RiskCellTable,
  type RiskScenario,
} from "../../../../_components/RiskCellGrid";
import { cityFromSlug } from "../../../../_lib/useTrack";
import { useDemoT } from "../../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../../_lib/hrefs";
import { ADAPTABRASIL_URL } from "../../../../_lib/links";
import {
  ADAPTA_SECTORS,
  RISK_CELLS,
  SECTOR_LABEL,
  UNCOVERED_HAZARD_LABEL,
} from "../../../../_lib/riskCells";
import { downloadCsv } from "../../../../_lib/csv";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { useLabels } from "../../../../_lib/useLabels";
import { MeedChipGroup } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedChipGroup";
import { pick } from "../../../../_lib/localized";

const SCENARIOS: RiskScenario[] = ["today", "2030", "2050"];

/** BR-A2 — the city's AdaptaBrasil risk profile. */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const [scenario, setScenario] = useState<RiskScenario>("today");
  const [sectors, setSectors] = useState<string[]>([]);
  const labels = useLabels(lng, "adaptation");
  const exportCsv = () => {
    const cells = sectors.length
      ? RISK_CELLS.filter((c) => sectors.includes(c.sector))
      : RISK_CELLS;
    const value = (n: number | undefined) =>
      n === undefined ? "" : n.toFixed(2);
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
      cells.map((c) => {
        const r = city.risk[c.key];
        const index = !r
          ? undefined
          : scenario === "today"
            ? r.index
            : scenario === "2030"
              ? r.index2030
              : r.index2050;
        return [
          pick(c.label, lng),
          pick(SECTOR_LABEL[c.sector], lng),
          r && c.hasComponents ? value(r.hazard) : "",
          r && c.hasComponents ? value(r.exposure) : "",
          r && c.hasComponents ? value(r.vulnerability) : "",
          value(index),
        ];
      }),
    );
  };

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="risk"
      screenId={SCREEN_IDS.adaptation.risk}
      title={t("risk-title")}
      description={t("risk-intro")}
      backLabel={t("back-to-home")}
      openPoints={[t("open-risk-hazard")]}
    >
      <VStack alignItems="stretch" gap="m">
        <HStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="m"
          flexWrap="wrap"
        >
          <VStack alignItems="stretch" gap="xs">
            <TitleMedium color="content.primary">
              {t("risk-table-title")}
            </TitleMedium>
            <BodyMedium color="content.secondary">
              {t("risk-table-description")}
            </BodyMedium>
          </VStack>
          <HStack gap="m" alignItems="center" flexWrap="wrap">
            <Tabs.Root
              variant="enclosed"
              size="sm"
              value={scenario}
              onValueChange={(d) => setScenario(d.value as RiskScenario)}
            >
              <Tabs.List>
                {SCENARIOS.map((s) => (
                  <Tabs.Trigger key={s} value={s} _focusVisible={FOCUS_RING}>
                    {t(`risk-scenario-${s}`)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs.Root>
            <MeedButton
              variant="outlined"
              minW="auto"
              px="m"
              leftIcon={<Icon as={LuDownload} boxSize="16px" />}
              onClick={exportCsv}
              _focusVisible={FOCUS_RING}
            >
              {t("next-export-csv")}
            </MeedButton>
          </HStack>
        </HStack>
        {scenario !== "today" && (
          <HStack
            gap="s"
            px="m"
            py="s"
            borderRadius="rounded"
            bg="sentiment.warningOverlay"
            alignItems="flex-start"
          >
            <Icon
              as={LuInfo}
              boxSize="16px"
              color="sentiment.warningDefault"
              mt="2px"
            />
            <BodySmall color="content.secondary">
              {t("risk-scenario-note")}
            </BodySmall>
          </HStack>
        )}
        <MeedChipGroup
          options={ADAPTA_SECTORS.map((key) => ({
            value: key,
            label: labels.sector(key),
          }))}
          selected={sectors}
          onChange={setSectors}
          ariaLabel={t("next-legal-filter")}
        />
        <RiskCellTable
          city={city}
          lng={lng}
          t={t}
          scenario={scenario}
          sectors={sectors}
        />
        <BodySmall color="content.tertiary">{t("risk-hazard-note")}</BodySmall>
      </VStack>

      <Card.Root borderColor="sentiment.warningDefault">
        <Card.Body>
          <VStack alignItems="stretch" gap="s">
            <HStack gap="s" alignItems="center">
              <Icon
                as={LuMapPinOff}
                boxSize="18px"
                color="sentiment.warningDefault"
              />
              <LabelLarge color="content.primary">
                {t("risk-not-covered-title")}
              </LabelLarge>
            </HStack>
            <BodyMedium color="content.secondary">
              {t("risk-not-covered-body")}
            </BodyMedium>
            <HStack gap="xs" flexWrap="wrap">
              {(
                Object.keys(
                  UNCOVERED_HAZARD_LABEL,
                ) as (keyof typeof UNCOVERED_HAZARD_LABEL)[]
              ).map((h) => (
                <MeedStatusTag key={h} tone="warning">
                  {pick(UNCOVERED_HAZARD_LABEL[h], lng)}
                </MeedStatusTag>
              ))}
              <MeedStatusTag tone="neutral">
                {t("risk-not-covered-infra")}
              </MeedStatusTag>
            </HStack>
            {city.coastal && (
              <BodySmall color="sentiment.warningDefault">
                {t("risk-coastal-note", { city: city.name })}
              </BodySmall>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Link
        href={ADAPTABRASIL_URL}
        target="_blank"
        rel="noreferrer"
        color="content.link"
        fontFamily="heading"
        fontSize="label.md"
        fontWeight="semibold"
        alignSelf="flex-start"
        _focusVisible={FOCUS_RING}
      >
        <HStack gap="xs">
          <span>{t("risk-source-link")}</span>
          <Icon as={LuExternalLink} boxSize="14px" />
        </HStack>
      </Link>
    </DemoShell>
  );
}
