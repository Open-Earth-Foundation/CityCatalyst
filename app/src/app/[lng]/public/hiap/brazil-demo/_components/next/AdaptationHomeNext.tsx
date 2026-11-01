"use client";
import React, { useCallback, useMemo, useState } from "react";
import { Box, Icon, VStack } from "@chakra-ui/react";
import { LuSlidersHorizontal } from "react-icons/lu";
import { BodyMedium } from "@/components/package/Texts/Body";
import { TitleLarge } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { buildReportPdf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/meedReportPdf";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { useTrack } from "../../_lib/useTrack";
import { useDemoT, useTrackT } from "../../_lib/useDemoT";
import { useLabels } from "../../_lib/useLabels";
import { SCREEN_IDS, trackHref } from "../../_lib/hrefs";
import { RISK_CELL_BY_KEY, RISK_CELLS } from "../../_lib/riskCells";
import { ACTION_BY_ID, ADAPTATION_ACTIONS } from "../../_lib/actions";
import { buildDemoReport } from "../../_lib/report";
import { downloadCsv } from "../../_lib/csv";
import { rankAdaptation, type NotRankedAction } from "../../_lib/ranking";
import { pick } from "../../_lib/localized";
import { DemoHero } from "../DemoHero";
import { TrackTabs } from "../TrackTabs";
import { ConceptNotice } from "../ConceptNotice";
import { useSearchParam, writeSearchParams } from "./ListControls";
import {
  DEFAULT_PRIORITIES,
  PreferencesSheet,
  type RankingPriorities,
} from "./PreferencesSheet";
import { RankingBasis } from "./RankingBasis";
import { RankingRecipe } from "./RankingRecipe";
import { TopRisks } from "./TopRisks";
import { TopActions } from "./TopActions";
import { RankedActionsTable } from "./RankedActionsTable";
import { ActionDrawer } from "./ActionDrawer";
import { CityContextDialog } from "./CityContextDialog";
import { isCustomWeights } from "./WeightSliders";
import {
  applyCityOrder,
  buildRows,
  EMPTY_FILTERS,
  FACET_KEYS,
  filtersFromSearch,
  filtersToSearch,
  matchesFilters,
  type RankedRow,
  type RowFilters,
} from "./rows";

/** A section of the home: title, one line, content. The same frame four times. */
function Section({
  id,
  title,
  body,
  children,
}: {
  id?: string;
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <VStack id={id} alignItems="stretch" gap="l" scrollMarginTop="l">
      <VStack alignItems="stretch" gap="xs">
        <TitleLarge color="content.primary">{title}</TitleLarge>
        {body && <BodyMedium color="content.secondary">{body}</BodyMedium>}
      </VStack>
      {children}
    </VStack>
  );
}

/**
 * BR-N1 — the proposed adaptation home, in the order a city officer reads:
 * where the city is exposed; what to do first; the full list to explore and
 * rework; how the ranking was built. Preferences that change the ranking
 * open in a sheet and apply as a new ranking; filters that narrow the list
 * sit on the list.
 */
export function AdaptationHomeNext({
  lng,
  citySlug,
}: {
  lng: string;
  citySlug: string;
}) {
  const track = "adaptation" as const;
  const data = useTrack(lng, citySlug, track);
  const {
    city,
    ranked,
    adaptation,
    state,
    isReady,
    setPreferences,
    setCityOrder,
  } = data;
  const { t } = useDemoT(lng);
  const tMeed = useTrackT(lng, track, "meed");
  const tResults = useTrackT(lng, track, "meed-results");
  const tPre = useTrackT(lng, track, "meed-preflight");
  const labels = useLabels(lng, track);

  // Panel and drawer can be opened from the URL (?panel=open, ?action=<id>
  // or ?action=top), so old wizard links and the review guide land on them.
  const urlPanel = useSearchParam("panel");
  const urlAction = useSearchParam("action");
  const [panelState, setPanelState] = useState<boolean | null>(null);
  const panelOpen = panelState ?? urlPanel === "open";
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelState(open);
    writeSearchParams({ panel: open ? "open" : null });
  }, []);
  const [contextOpen, setContextOpen] = useState(false);
  // Filters live in the URL so a filtered view can be shared. The list only
  // renders after hydration (isReady), so reading window here is safe.
  const [filters, setFiltersState] = useState<RowFilters>(() =>
    typeof window === "undefined"
      ? EMPTY_FILTERS
      : filtersFromSearch(window.location.search),
  );
  const setFilters = useCallback((next: RowFilters) => {
    setFiltersState(next);
    // Only the facet keys change; sort, panel and action stay in the URL.
    const qs = new URLSearchParams(filtersToSearch(next));
    writeSearchParams(
      Object.fromEntries(FACET_KEYS.map((k) => [k, qs.get(k)])),
    );
  }, []);
  const [openState, setOpenState] = useState<string | null | undefined>(
    undefined,
  );
  const setOpenId = useCallback((id: string | null) => {
    setOpenState(id);
    writeSearchParams({ action: id });
  }, []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // How many actions changed place in the last new ranking, shown once.
  const [movedAfterUpdate, setMovedAfterUpdate] = useState<number | null>(null);

  const rows = useMemo(() => buildRows(data, lng), [data, lng]);
  const openId =
    openState !== undefined
      ? openState
      : urlAction === "top"
        ? (applyCityOrder(rows, state.cityOrder ?? [])[0]?.action.id ?? null)
        : urlAction;
  const rowById = useMemo(
    () => new Map(rows.map((r) => [r.action.id, r])),
    [rows],
  );
  const visibleRows = useMemo(
    () => rows.filter((r) => matchesFilters(r, filters)),
    [rows, filters],
  );
  const cityOrder = useMemo(() => state.cityOrder ?? [], [state.cityOrder]);
  const topRows = useMemo(
    () => applyCityOrder(rows, cityOrder).slice(0, 3),
    [rows, cityOrder],
  );
  const footnote: NotRankedAction[] = useMemo(
    () =>
      (adaptation?.notRanked ?? []).filter((n) => n.reason !== "complementary"),
    [adaptation],
  );
  const reasonOf = (id: string) =>
    adaptation?.notRanked.find((n) => n.action.id === id)?.reason ?? null;

  const prefs = state.preferences;
  const hasPreferences =
    prefs.coBenefits.length +
      prefs.priorityRisks.length +
      prefs.sectors.length +
      prefs.timeline.length >
    0;
  const isCustom =
    hasPreferences ||
    prefs.excludedActionIds.length > 0 ||
    isCustomWeights(prefs.weights);
  const cellsWithData = RISK_CELLS.filter((c) => city.risk[c.key]).length;
  const applied: RankingPriorities = {
    coBenefits: prefs.coBenefits,
    priorityRisks: prefs.priorityRisks,
    sectors: prefs.sectors,
    timeline: prefs.timeline,
    weights: prefs.weights,
  };
  const priorityLabels = [
    ...prefs.coBenefits.map((k) => labels.coBenefit(k)),
    ...prefs.priorityRisks.map((k) => pick(RISK_CELL_BY_KEY[k].label, lng)),
    ...prefs.sectors.map((k) => labels.sector(k)),
    ...prefs.timeline.map((k) => labels.timeline(k)),
  ];

  // A new ranking from the city's priorities: apply, say how many actions
  // changed place, and bring the list into view where that is said.
  const runRanking = (next: RankingPriorities) => {
    const before = rows.map((r) => r.action.id);
    const after = rankAdaptation(city, ADAPTATION_ACTIONS, {
      ...prefs,
      ...next,
    }).ranked.map((s) => s.action.id);
    setMovedAfterUpdate(after.filter((id, i) => before[i] !== id).length);
    setPreferences(next);
    setPanelOpen(false);
    requestAnimationFrame(() =>
      document
        .getElementById("all-actions")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);
  const exclude = (id: string) =>
    setPreferences({
      excludedActionIds: [
        ...prefs.excludedActionIds.filter((x) => x !== id),
        id,
      ],
    });
  const include = (id: string) =>
    setPreferences({
      excludedActionIds: prefs.excludedActionIds.filter((x) => x !== id),
    });
  const currentOrder = () =>
    applyCityOrder(rows, cityOrder).map((r) => r.action.id);
  const move = (id: string, delta: -1 | 1) => {
    const order = currentOrder();
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setCityOrder(order);
  };
  const pin = (id: string) =>
    setCityOrder([id, ...currentOrder().filter((x) => x !== id)]);

  const generateReport = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setIsGenerating(true);
    try {
      const documents = buildDemoReport(
        selectedIds,
        data,
        lng,
        t,
        labels.timeline,
      );
      const pdf = await buildReportPdf(documents, {
        title: tResults("report-title"),
        cityName: `${city.name}, ${city.state}`,
        subtitle: tResults("report-subtitle", { count: documents.length }),
        limitationsLabel: tResults("report-limitations"),
        generatedBy: t("report-generated-by-demo"),
        generatedOn: `${tResults("report-footer-generated-on")} ${new Date().toLocaleDateString(lng)}`,
        pageLabel: tResults("report-footer-page"),
        ofLabel: tResults("report-footer-of"),
      });
      pdf.save(`hiap-brazil-demo-${city.slug}-${track}.pdf`);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedIds, data, lng, t, tResults, city, track, labels]);

  const exportCsv = () =>
    downloadCsv(
      `hiap-brazil-demo-${city.slug}-ranking.csv`,
      [
        t("next-col-action"),
        t("next-col-sector"),
        t("next-col-risk"),
        t("next-col-cost"),
        t("next-col-legal"),
        t("next-col-funding"),
        t("next-col-policy"),
        t("next-col-timeline"),
      ],
      applyCityOrder(visibleRows, cityOrder).map((r) => [
        pick(r.action.name, lng),
        r.sectorLabel,
        `${r.hazardLabel} · ${t(`risk-level-${r.riskTone}`)}`,
        t(`next-cost-${r.cost}`),
        r.legalLabel,
        r.fundingLabel,
        t(`next-policy-${r.policy}`),
        labels.timeline(r.timeline),
      ]),
    );

  const openAction = ACTION_BY_ID[openId ?? ""] ?? null;
  const openRow: RankedRow | null = openId
    ? (rowById.get(openId) ?? null)
    : null;

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <DemoHero
        lng={lng}
        city={city}
        track={track}
        screenId={SCREEN_IDS.next.home}
        line={t("next-hero-line", { count: cellsWithData })}
        description={tMeed("overview-description")}
        status={
          isReady
            ? t("next-hero-status", {
                count: ranked.length,
                settings: isCustom
                  ? t("next-settings-custom")
                  : t("next-settings-default"),
              })
            : undefined
        }
        action={
          <MeedButton
            minW="auto"
            px="l"
            bg="base.light"
            color="content.link"
            borderWidth="1px"
            borderColor="base.light"
            _hover={{ bg: "background.neutral" }}
            leftIcon={<Icon as={LuSlidersHorizontal} boxSize="16px" />}
            onClick={() => setPanelOpen(true)}
            _focusVisible={FOCUS_RING}
          >
            {t("next-customize")}
          </MeedButton>
        }
      />
      <TrackTabs lng={lng} city={city.slug} track={track} />

      <Box
        mx="auto"
        pt="xxl"
        pb="xxl-6"
        px="l"
        w="full"
        // Same column as the hero, tabs and sub-pages.
        maxW="1090px"
      >
        {!isReady ? null : (
          <VStack alignItems="stretch" gap="xxl-6" minW={0}>
            <Section
              title={t("next-section-risks", { city: city.name })}
              body={t("next-section-risks-body")}
            >
              <TopRisks
                city={city}
                lng={lng}
                t={t}
                href={trackHref(lng, city.slug, track, "risk")}
                onContext={() => setContextOpen(true)}
              />
            </Section>
            <Section
              title={t("next-section-actions")}
              body={t("next-section-actions-body", { city: city.name })}
            >
              <TopActions
                rows={topRows}
                lng={lng}
                t={t}
                tResults={tResults}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onOpen={(row) => setOpenId(row.action.id)}
              />
            </Section>
            <Section
              id="all-actions"
              title={t("next-section-list")}
              body={t("next-section-list-body")}
            >
              <RankingBasis
                priorities={priorityLabels}
                customWeights={isCustomWeights(prefs.weights)}
                movedAfterUpdate={movedAfterUpdate}
                onAdjust={() => setPanelOpen(true)}
                onDefault={() => runRanking({ ...DEFAULT_PRIORITIES })}
                t={t}
              />
              <RankedActionsTable
                rows={rows}
                cityOrder={cityOrder}
                notRanked={footnote}
                reasonOf={reasonOf}
                filters={filters}
                onFiltersChange={setFilters}
                lng={lng}
                t={t}
                tResults={tResults}
                labels={labels}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onOpen={(row) => setOpenId(row.action.id)}
                onOpenUnranked={(item) => setOpenId(item.action.id)}
                onOpenAction={setOpenId}
                onExclude={exclude}
                onInclude={include}
                onMove={move}
                onPin={pin}
                onResetOrder={() => setCityOrder([])}
                onExportCsv={exportCsv}
                report={{
                  onGenerate: generateReport,
                  isGenerating,
                  progress: null,
                }}
              />
            </Section>
            <Section title={t("next-section-built")}>
              <RankingRecipe
                lng={lng}
                data={data}
                hasPreferences={hasPreferences}
                t={t}
              />
            </Section>
          </VStack>
        )}
      </Box>

      {panelOpen && isReady && (
        <PreferencesSheet
          cityName={city.name}
          applied={applied}
          onApply={runRanking}
          onClose={() => setPanelOpen(false)}
          lng={lng}
          labels={labels}
          t={t}
          tPre={tPre}
        />
      )}

      <CityContextDialog
        city={city}
        lng={lng}
        open={contextOpen}
        onOpenChange={setContextOpen}
        t={t}
      />

      {openAction && (
        <ActionDrawer
          action={openAction}
          row={openRow}
          reason={openRow ? null : reasonOf(openAction.id)}
          data={data}
          lng={lng}
          t={t}
          tResults={tResults}
          labels={labels}
          isRanked={(id) => rowById.has(id)}
          reasonOf={reasonOf}
          onClose={() => setOpenId(null)}
          onOpenAction={setOpenId}
          isSelected={selectedIds.includes(openAction.id)}
          onToggleSelect={toggleSelect}
        />
      )}

      <ConceptNotice
        lng={lng}
        points={[
          t("next-notice-proposal"),
          t("next-notice-order"),
          t("next-notice-enabling"),
          t("next-notice-weights"),
        ]}
      />
    </Box>
  );
}
