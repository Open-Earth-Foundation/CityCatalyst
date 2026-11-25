"use client";
import React, { useCallback, useMemo, useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import { buildReportPdf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/meedReportPdf";
import { useTrack } from "../../_lib/useTrack";
import { useDemoState } from "../../_lib/state";
import { useDemoT, useTrackT } from "../../_lib/useDemoT";
import { useLabels } from "../../_lib/useLabels";
import { SCREEN_IDS, trackHref } from "../../_lib/hrefs";
import { RISK_CELL_BY_KEY } from "../../_lib/riskCells";
import { ACTION_BY_ID, ADAPTATION_ACTIONS } from "../../_lib/actions";
import { buildDemoReport } from "../../_lib/report";
import { downloadCsv } from "../../_lib/csv";
import { rankAdaptation } from "../../_lib/ranking";
import { pick } from "../../_lib/localized";
import { DemoHero, HeroLink } from "../DemoHero";
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
import { RankedActionsTable } from "./RankedActionsTable";
import { TextLink } from "./TextLink";
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
  type RankedRow,
  type RowFilters,
} from "./rows";

/** A section of the home: title, one line, content. */
function Section({
  id,
  title,
  body,
  children,
}: {
  id?: string;
  title: string;
  body?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <VStack id={id} alignItems="stretch" gap="l" scrollMarginTop="l">
      <VStack alignItems="stretch" gap="xs">
        <TitleLarge as="h2" color="content.primary">
          {title}
        </TitleLarge>
        {body}
      </VStack>
      {children}
    </VStack>
  );
}

const scrollTo = (id: string) =>
  requestAnimationFrame(() =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );

/**
 * BR-N1 — the proposed adaptation home, after review round 2: a short blue
 * band that says what the tool does and how many actions it found; the
 * city's top three climate risks in their own box; then one list of actions
 * with every control at its head (shortcuts, filters, preferences), the
 * first three grouped as "start with these". Selection, the city's order and
 * actions marked as implemented are kept in this browser.
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
  const { setSelectedIds, setImplementedIds } = useDemoState(
    city.slug,
    track,
  );
  const { t } = useDemoT(lng);
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
  const [isGenerating, setIsGenerating] = useState(false);
  // How many actions changed place in the last update, shown once.
  const [movedAfterUpdate, setMovedAfterUpdate] = useState<number | null>(null);

  // Selection and "already implemented" are kept with the city's order.
  const selectedIds = useMemo(
    () => state.selectedIds ?? [],
    [state.selectedIds],
  );
  const implementedIds = useMemo(
    () => state.implementedIds ?? [],
    [state.implementedIds],
  );

  const allRows = useMemo(() => buildRows(data, lng), [data, lng]);
  // The list leaves out what the city already implemented.
  const rows = useMemo(
    () => allRows.filter((r) => !implementedIds.includes(r.action.id)),
    [allRows, implementedIds],
  );
  const cityOrder = useMemo(() => state.cityOrder ?? [], [state.cityOrder]);
  const openId =
    openState !== undefined
      ? openState
      : urlAction === "top"
        ? (applyCityOrder(rows, cityOrder)[0]?.action.id ?? null)
        : urlAction;
  const rowById = useMemo(
    () => new Map(allRows.map((r) => [r.action.id, r])),
    [allRows],
  );
  const implemented = useMemo(
    () => implementedIds.flatMap((id) => ACTION_BY_ID[id] ?? []),
    [implementedIds],
  );
  const leftOut = useMemo(
    () =>
      (adaptation?.notRanked ?? [])
        .filter((n) => n.reason === "excluded_by_city")
        .map((n) => n.action),
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
  const applied: RankingPriorities = {
    coBenefits: prefs.coBenefits,
    priorityRisks: prefs.priorityRisks,
    sectors: prefs.sectors,
    timeline: prefs.timeline,
    weights: prefs.weights,
  };
  const priorityLabels = [
    ...prefs.priorityRisks.map((k) => pick(RISK_CELL_BY_KEY[k].label, lng)),
    ...prefs.coBenefits.map((k) => labels.coBenefit(k)),
    ...prefs.timeline.map((k) => labels.timeline(k)),
    ...prefs.sectors.map((k) => labels.sector(k)),
  ];

  // A new order from the city's preferences: apply, say how many actions
  // changed place, and bring the list into view where that is said.
  const runRanking = (next: RankingPriorities) => {
    const before = rows.map((r) => r.action.id);
    const after = rankAdaptation(city, ADAPTATION_ACTIONS, {
      ...prefs,
      ...next,
    })
      .ranked.map((s) => s.action.id)
      .filter((id) => !implementedIds.includes(id));
    setMovedAfterUpdate(after.filter((id, i) => before[i] !== id).length);
    setPreferences(next);
    setPanelOpen(false);
    scrollTo("actions");
  };

  const toggleSelect = useCallback(
    (id: string) =>
      setSelectedIds(
        selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id],
      ),
    [selectedIds, setSelectedIds],
  );
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
  const markImplemented = (id: string) => {
    setImplementedIds([...implementedIds.filter((x) => x !== id), id]);
    // Implemented actions are not exported, so they leave the selection.
    if (selectedIds.includes(id))
      setSelectedIds(selectedIds.filter((x) => x !== id));
  };
  const unmarkImplemented = (id: string) =>
    setImplementedIds(implementedIds.filter((x) => x !== id));
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

  // Only actions still on the list go into the report.
  const exportIds = useMemo(
    () =>
      applyCityOrder(rows, cityOrder)
        .map((r) => r.action.id)
        .filter((id) => selectedIds.includes(id)),
    [rows, cityOrder, selectedIds],
  );
  const generateReport = useCallback(async () => {
    if (exportIds.length === 0) return;
    setIsGenerating(true);
    try {
      const documents = buildDemoReport(
        exportIds,
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
  }, [exportIds, data, lng, t, tResults, city, track, labels]);

  // The list as shown: its position in the current order and whether the
  // city selected it (review: the CSV should say both).
  const exportCsv = (ordered: RankedRow[]) =>
    downloadCsv(
      `hiap-brazil-demo-${city.slug}-actions.csv`,
      [
        t("next-col-position"),
        t("next-col-selected"),
        t("next-col-action"),
        t("next-col-sector"),
        t("next-col-risk"),
        t("next-col-cost"),
        t("next-col-legal"),
        t("next-col-funding"),
        t("next-col-policy"),
        t("next-col-timeline"),
      ],
      ordered.map((r, i) => [
        String(i + 1),
        selectedIds.includes(r.action.id) ? t("next-yes") : t("next-no"),
        pick(r.action.name, lng),
        r.sectorLabel,
        `${r.hazardLabel} · ${t(`next-risk-level-${r.riskTone}`)}`,
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
  const firstId = applyCityOrder(rows, cityOrder)[0]?.action.id ?? null;

  // What a city does here, in four verbs: one line, each one a way in.
  const ways: { key: string; onClick: () => void }[] = [
    { key: "see", onClick: () => scrollTo("action-list") },
    { key: "adjust", onClick: () => setPanelOpen(true) },
    { key: "export", onClick: () => scrollTo("action-list") },
    { key: "open", onClick: () => firstId && setOpenId(firstId) },
  ];

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
        headline={t("next-hero-headline")}
        cityAside={
          <HeroLink onClick={() => setContextOpen(true)}>
            {t("next-context-link")}
          </HeroLink>
        }
        line={
          isReady ? (
            <HStack gap="s" flexWrap="wrap" data-testid="hero-status">
              <Text fontSize="body.md" color="background.overlay">
                {t("next-hero-identified", { count: ranked.length })}
              </Text>
              <HeroLink onClick={() => scrollTo("actions")}>
                {t("next-hero-see")}
              </HeroLink>
            </HStack>
          ) : null
        }
      />
      <TrackTabs lng={lng} city={city.slug} track={track} />

      <Box
        mx="auto"
        pt="l"
        pb="xxl-6"
        px="l"
        w="full"
        // Same column as the hero, tabs and sub-pages.
        maxW="1090px"
      >
        {!isReady ? null : (
          <VStack alignItems="stretch" gap="xxl" minW={0}>
            <TopRisks
              city={city}
              lng={lng}
              t={t}
              title={t("next-section-risks")}
              href={trackHref(lng, city.slug, track, "risk")}
            />
            <Section
              id="actions"
              title={t("next-section-actions")}
              body={
                <VStack alignItems="stretch" gap="s">
                  <BodyMedium color="content.secondary">
                    {t("next-section-actions-body")}
                  </BodyMedium>
                  <HStack
                    as="nav"
                    aria-label={t("next-ways-title")}
                    gap={{ base: "m", md: "l" }}
                    rowGap="xs"
                    flexWrap="wrap"
                    alignItems="center"
                    data-testid="ways-in"
                  >
                    <Overline
                      color="content.tertiary"
                      w={{ base: "full", md: "auto" }}
                    >
                      {t("next-ways-title")}
                    </Overline>
                    {ways.map((w) => (
                      <TextLink key={w.key} arrow={false} onClick={w.onClick}>
                        {t(`next-ways-${w.key}`)}
                      </TextLink>
                    ))}
                  </HStack>
                </VStack>
              }
            >
              <Box id="action-list" scrollMarginTop="l">
                <RankedActionsTable
                  rows={rows}
                  cityOrder={cityOrder}
                  reasonOf={reasonOf}
                  filters={filters}
                  onFiltersChange={setFilters}
                  orderControls={
                    <RankingBasis
                      priorities={priorityLabels}
                      customWeights={isCustomWeights(prefs.weights)}
                      movedAfterUpdate={movedAfterUpdate}
                      onAdjust={() => setPanelOpen(true)}
                      onDefault={() => runRanking({ ...DEFAULT_PRIORITIES })}
                      t={t}
                    />
                  }
                  lng={lng}
                  t={t}
                  tResults={tResults}
                  labels={labels}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onSelectMany={setSelectedIds}
                  onOpen={(row) => setOpenId(row.action.id)}
                  implemented={implemented}
                  leftOut={leftOut}
                  onImplemented={markImplemented}
                  onUnimplemented={unmarkImplemented}
                  onExclude={exclude}
                  onInclude={include}
                  onMove={move}
                  onPin={pin}
                  onResetOrder={() => setCityOrder([])}
                  onExportCsv={exportCsv}
                  onExportPdf={generateReport}
                  isGenerating={isGenerating}
                  savedAt={state.savedAt ?? null}
                  onOpenAction={setOpenId}
                  cityName={city.name}
                />
              </Box>
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
