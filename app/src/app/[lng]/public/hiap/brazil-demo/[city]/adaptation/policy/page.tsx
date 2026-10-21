"use client";
import React, { useState } from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { useLabels } from "../../../_lib/useLabels";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import {
  planoClimaPlans,
  planShortName,
} from "../../../_components/next/planoClima";
import { ADAPTA_SECTORS, SECTOR_LABEL } from "../../../_lib/riskCells";
import { pick } from "../../../_lib/localized";
import type { AdaptationAction, PolicyMatch } from "../../../_lib/types";
import { Level } from "../../../_components/next/Level";
import { SectorGlyph } from "../../../_components/next/SectorIcon";
import { TextLink } from "../../../_components/next/TextLink";
import {
  POLICY_TONE,
  policyGrade,
  type PolicyGrade,
} from "../../../_components/next/rows";
import {
  ExpandableRow,
  RowList,
} from "../../../_components/next/ExpandableRow";
import {
  FacetFilters,
  useUrlSelection,
} from "../../../_components/next/ListControls";
import { matchesFacets, type Facet } from "../../../_components/next/facets";

const GRADES: PolicyGrade[] = ["strong", "medium", "weak", "none"];
const MATCH_TONE: Record<PolicyMatch, MeedTone> = {
  direct: "positive",
  partial: "warning",
  adjacent: "neutral",
};

/**
 * BR-N9 — proposal: policy alignment, the expandable pattern the reviewers
 * liked, restyled to the proposal's rules. Each action reads as a level of
 * policy backing; the evidence opens below it, and the score sits behind
 * "Show the calculation", as in the drawer.
 */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const labels = useLabels(lng, "adaptation");
  const [open, setOpen] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState<string | null>(null);
  const [selected, setSelected] = useUrlSelection(["sector", "policy", "plan"]);

  const all = [...ADAPTATION_ACTIONS].sort(
    (a, b) => b.policy.score - a.policy.score,
  );
  const facets: Facet<AdaptationAction>[] = [
    {
      key: "sector",
      title: t("next-filter-sectors"),
      options: ADAPTA_SECTORS.map((k) => ({
        value: k,
        label: labels.sector(k),
      })),
      values: (a) => [a.sector],
      chip: (o) => o.label,
    },
    {
      key: "policy",
      title: t("next-col-policy"),
      options: GRADES.map((g) => ({
        value: g,
        label: t(`next-policy-${g}`),
      })),
      values: (a) => [policyGrade(a.policy.score)],
      chip: (o) => o.label,
    },
  ];
  // Plano Clima: the strategy and sectoral plans the evidence cites.
  const planDocs = [
    ...new Set(all.flatMap((a) => planoClimaPlans(a).map((p) => p.document))),
  ].sort();
  facets.push({
    key: "plan",
    title: t("next-filter-plan"),
    options: planDocs.map((d) => ({ value: d, label: planShortName(d) })),
    values: (a) => planoClimaPlans(a).map((p) => p.document),
    chip: (o) => o.label,
  });
  const visible = all.filter((a) => matchesFacets(a, facets, selected));
  const docs = new Set(
    all.flatMap((a) => a.policy.evidence.map((e) => e.document)),
  );

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="policy"
      screenId={SCREEN_IDS.next.policy}
      title={t("policy-title")}
      description={t("next-policy-intro")}
      backLabel={t("back-to-home")}
      openPoints={[
        t("next-notice-proposal"),
        t("open-policy-corpus"),
        t("next-notice-policy-plans"),
      ]}
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
              {t("policy-table-title")}
            </TitleLarge>
            <BodySmall color="content.secondary">
              {t("next-policy-rows", {
                count: visible.length,
                docs: docs.size,
              })}
            </BodySmall>
          </VStack>
          <HStack gap="l" flexWrap="wrap">
            {GRADES.map((g) => (
              <Level key={g} tone={POLICY_TONE[g]}>
                {t(`next-policy-${g}`)} ·{" "}
                {all.filter((a) => policyGrade(a.policy.score) === g).length}
              </Level>
            ))}
          </HStack>
        </HStack>
        <BodySmall color="content.secondary">
          {t("policy-city-independent-short")}
        </BodySmall>

        <FacetFilters
          items={all}
          facets={facets}
          selected={selected}
          onChange={setSelected}
          t={t}
        />

        <RowList>
          {visible.map((a) => {
            const g = policyGrade(a.policy.score);
            return (
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
                    {t("policy-evidence-count", {
                      count: a.policy.evidence.length,
                    })}
                  </>
                }
                aside={
                  <Level tone={POLICY_TONE[g]}>{t(`next-policy-${g}`)}</Level>
                }
              >
                <VStack alignItems="stretch" gap="l">
                  {a.policy.evidence.length === 0 ? (
                    <BodyMedium color="content.secondary">
                      {t("policy-no-evidence")}
                    </BodyMedium>
                  ) : (
                    <>
                      <Overline color="content.tertiary">
                        {t("next-policy-evidence")}
                      </Overline>
                      {a.policy.evidence.map((e, i) => (
                        <VStack
                          key={`${e.document}-${e.page}-${i}`}
                          alignItems="stretch"
                          gap="xs"
                          pb="m"
                          borderBottomWidth={
                            i < a.policy.evidence.length - 1 ? "1px" : "0"
                          }
                          borderColor="border.overlay"
                        >
                          <HStack
                            justifyContent="space-between"
                            gap="m"
                            flexWrap="wrap"
                          >
                            <BodyMedium
                              color="content.primary"
                              fontWeight="semibold"
                            >
                              {e.document} ·{" "}
                              {t("policy-page-short", { page: e.page })}
                            </BodyMedium>
                            <Level tone={MATCH_TONE[e.match]}>
                              {t(`next-match-${e.match}`)}
                            </Level>
                          </HStack>
                          <BodySmall color="content.tertiary">
                            {t(`tier-${e.documentTier}`)} ·{" "}
                            {t(`record-type-${e.recordType}`)} ·{" "}
                            {t(`strength-${e.strength}`)} ·{" "}
                            {t(e.explicit ? "explicit" : "inferred")} ·{" "}
                            {t(`confidence-${e.confidence}`)}
                          </BodySmall>
                          <BodyMedium color="content.primary" lang="pt-BR">
                            {e.pt}
                          </BodyMedium>
                          {/* The English aid helps non-Portuguese reviewers only. */}
                          {lng !== "pt" && (
                            <BodySmall color="content.secondary">
                              {t("policy-en-aid")}: {e.en}
                            </BodySmall>
                          )}
                        </VStack>
                      ))}
                      <BodySmall color="content.tertiary">
                        {t("policy-pt-authoritative")}
                      </BodySmall>
                    </>
                  )}
                  <Box>
                    <TextLink
                      arrow={false}
                      onClick={() =>
                        setCalcOpen(calcOpen === a.id ? null : a.id)
                      }
                    >
                      {calcOpen === a.id
                        ? t("next-drawer-method-hide")
                        : t("next-drawer-method-show")}
                    </TextLink>
                  </Box>
                  {calcOpen === a.id && (
                    <VStack alignItems="stretch" gap="xs">
                      <BodyMedium color="content.primary">
                        {t("next-policy-score", {
                          value: new Intl.NumberFormat(
                            lng === "pt" ? "pt-BR" : "en",
                            {
                              maximumFractionDigits: 1,
                            },
                          ).format(a.policy.score),
                        })}
                      </BodyMedium>
                      <BodySmall color="content.secondary">
                        {t("policy-formula-note")}
                      </BodySmall>
                      <BodySmall color="content.secondary">
                        {t("policy-grades-note")}
                      </BodySmall>
                    </VStack>
                  )}
                </VStack>
              </ExpandableRow>
            );
          })}
        </RowList>
      </VStack>
    </DemoShell>
  );
}
