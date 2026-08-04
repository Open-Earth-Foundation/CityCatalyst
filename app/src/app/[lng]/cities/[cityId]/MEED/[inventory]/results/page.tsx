"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, VStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { api, useGetMeedActionsQuery } from "@/services/api";
import { formatEmissions } from "@/util/helpers";
import type {
  MeedPrioritizeCityResult,
  MeedRankedActionResult,
} from "@/util/types/meed";
import { MeedShell } from "../../components/MeedShell";
import { useMeedSectionStates } from "../../meedStatus";
import { stepHref } from "../../navigation";
import { EmptyState } from "./components/EmptyState";
import { FullRanking } from "./components/FullRanking";
import { DetailPanel, type ScoreWeights } from "./components/DetailPanel";
import { ResultsHeader } from "./components/ResultsHeader";
import { TopPicks } from "./components/TopPicks";
import { CoBenefitStrip } from "./components/CoBenefitStrip";
import { ContextCardGrid } from "./components/ContextCardGrid";
import { ContextBreakdown } from "./components/ContextBreakdown";
import { NextStepsBanner } from "./components/NextStepsBanner";
import { buildActionIndex } from "./components/actionCatalog";
import { useMeedRanking } from "../../useMeedRanking";
import { tallyCoBenefits } from "./components/coBenefits";
import { excludedActionCount, policyBacking } from "./components/rankingFacts";

/**
 * Default final-score weights from the prototype scoring pipeline.
 * TODO(meed backend): read the actual weights from the prioritization
 * response metadata once the ranking is wired in.
 */
const SCORE_WEIGHTS: ScoreWeights = {
  impact: 0.55,
  alignment: 0.22,
  feasibility: 0.23,
};

const TAB_RESULTS = "results";
const TAB_CONTEXT = "context";

const TAB_TRIGGER_STYLES = {
  _selected: {
    color: "content.link",
    borderColor: "content.link",
    borderBottomWidth: "2px",
    fontWeight: "bold",
    borderRadius: "0",
    boxShadow: "none",
  },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "content.link",
    outlineOffset: "2px",
  },
};

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed-results");
  const { t: tMeed } = useTranslation(lng, "meed");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read through the shared hook so this screen and the landing screen can
  // never disagree about whether a ranking exists.
  const { states } = useMeedSectionStates(inventoryId);
  const { ranking: stored } = useMeedRanking(inventoryId, states);
  const ranking: MeedPrioritizeCityResult | null = stored?.result ?? null;
  const [selected, setSelected] = useState<MeedRankedActionResult | null>(null);

  // One selection, shared by the top-pick cards and the ranking rows, feeding
  // the single "Generate report" button in the header.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = useCallback((actionId: string) => {
    setSelectedIds((previous) =>
      previous.includes(actionId)
        ? previous.filter((id) => id !== actionId)
        : [...previous, actionId],
    );
  }, []);

  // Returning from an input screen lands on the tab the user left from.
  const [tab, setTab] = useState<string>(
    searchParams.get("tab") === TAB_CONTEXT ? TAB_CONTEXT : TAB_RESULTS,
  );

  const rankingRef = useRef<HTMLDivElement | null>(null);
  const showFullRanking = useCallback(() => {
    setTab(TAB_RESULTS);
    rankingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const { data: catalog, isLoading: isCatalogLoading } = useGetMeedActionsQuery(
    {
      cityId,
    },
  );
  const index = useMemo(() => buildActionIndex(catalog), [catalog]);

  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });

  const ranked = useMemo(() => ranking?.ranked_actions ?? [], [ranking]);
  const topPicks = useMemo(() => ranked.slice(0, 3), [ranked]);
  const excludedCount = excludedActionCount(ranking);
  const backing = useMemo(() => policyBacking(ranked), [ranked]);
  const coBenefits = useMemo(
    () => tallyCoBenefits(topPicks, index),
    [topPicks, index],
  );

  const emissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : undefined;
  const emissionsText = emissions
    ? `${emissions.value} ${emissions.unit}CO2e`.trim()
    : undefined;

  const facts = {
    emissionsText,
    inventoryYear: inventory?.year ?? undefined,
    rankedCount: ranked.length,
    excludedCount,
    strongPolicyBacking: backing.strong,
    states,
  };

  // Every context deep link comes back to this screen's context tab.
  const hrefFor = (segment: string) =>
    stepHref(lng, cityId, inventoryId, segment, "results", TAB_CONTEXT);

  return (
    <MeedShell
      lng={lng}
      cityId={cityId}
      inventoryId={inventoryId}
      title={t("page-title")}
      description={t("page-description")}
      currentLabel={t("page-title")}
    >
      <>
        {ranked.length === 0 ? (
          <EmptyState
            title={t("empty-title")}
            body={t("empty-body")}
            actionLabel={t("empty-action")}
            onAction={() =>
              router.push(
                `/${lng}/cities/${cityId}/MEED/${inventoryId}/preflight`,
              )
            }
          />
        ) : (
          <VStack alignItems="stretch" gap="xl">
            <ResultsHeader
              rankedCount={ranked.length}
              excludedCount={excludedCount}
              emissionsText={emissionsText}
              selectedCount={selectedIds.length}
              t={t}
            />

            <Tabs.Root
              value={tab}
              onValueChange={(details) => setTab(details.value)}
              variant="line"
            >
              <Tabs.List mb="l" borderColor="border.overlay">
                <Tabs.Trigger value={TAB_RESULTS} {...TAB_TRIGGER_STYLES}>
                  {t("tab-results")}
                </Tabs.Trigger>
                <Tabs.Trigger value={TAB_CONTEXT} {...TAB_TRIGGER_STYLES}>
                  {t("tab-context")}
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value={TAB_RESULTS}>
                <VStack alignItems="stretch" gap="xl">
                  <TopPicks
                    actions={topPicks}
                    index={index}
                    t={t}
                    isCatalogLoading={isCatalogLoading}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onOpenDetail={setSelected}
                    onBrowseFullRanking={showFullRanking}
                  />
                  <CoBenefitStrip
                    benefits={coBenefits}
                    total={topPicks.length}
                    t={t}
                  />
                  <ContextCardGrid
                    facts={facts}
                    t={t}
                    hrefFor={hrefFor}
                    onShowFullRanking={showFullRanking}
                  />
                  <NextStepsBanner
                    selectedCount={selectedIds.length}
                    onBrowseFullRanking={showFullRanking}
                    t={t}
                  />
                </VStack>
              </Tabs.Content>

              <Tabs.Content value={TAB_CONTEXT}>
                <ContextBreakdown
                  facts={facts}
                  backing={backing}
                  t={t}
                  tMeed={tMeed}
                  hrefFor={hrefFor}
                />
              </Tabs.Content>
            </Tabs.Root>

            <FullRanking
              ref={rankingRef}
              actions={ranked}
              index={index}
              t={t}
              onSelect={setSelected}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          </VStack>
        )}

        {selected && (
          <DetailPanel
            action={selected}
            index={index}
            weights={SCORE_WEIGHTS}
            t={t}
            onClose={() => setSelected(null)}
          />
        )}
      </>
    </MeedShell>
  );
}
