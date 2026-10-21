"use client";
import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Drawer,
  Grid,
  HStack,
  Icon,
  Portal,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react";
import { LuChevronLeft, LuSlidersHorizontal } from "react-icons/lu";
import { CloseButton } from "@/components/ui/close-button";
import { BodyMedium } from "@/components/package/Texts/Body";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { buildReportPdf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/meedReportPdf";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { useTrack } from "../../_lib/useTrack";
import { useDemoT, useTrackT } from "../../_lib/useDemoT";
import { useLabels } from "../../_lib/useLabels";
import { SCREEN_IDS, trackHref } from "../../_lib/hrefs";
import { RISK_CELLS } from "../../_lib/riskCells";
import { ACTION_BY_ID } from "../../_lib/actions";
import { buildDemoReport } from "../../_lib/report";
import { downloadCsv } from "../../_lib/csv";
import type { NotRankedAction } from "../../_lib/ranking";
import { pick } from "../../_lib/localized";
import { DemoHero } from "../DemoHero";
import { TrackTabs } from "../TrackTabs";
import { ConceptNotice } from "../ConceptNotice";
import { RankingControls } from "./RankingControls";
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
  filtersFromSearch,
  filtersToSearch,
  matchesFilters,
  type RankedRow,
  type RowFilters,
} from "./rows";

/** A section of the home: title, one line, content. The same frame four times. */
function Section({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <VStack alignItems="stretch" gap="l">
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
 * live in the side panel; filters that narrow the list sit on the list.
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
  const isNarrow = useBreakpointValue({ base: true, lg: false }) ?? false;

  const [panelOpen, setPanelOpen] = useState(false);
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
    const qs = filtersToSearch(next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const rows = useMemo(() => buildRows(data, lng), [data, lng]);
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
      const documents = buildDemoReport(selectedIds, data, lng, t);
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
      pdf.save(`hiap-brazil-demo-${city.slug}-${track}-next.pdf`);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedIds, data, lng, t, tResults, city, track]);

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
  const controls = (
    <RankingControls lng={lng} data={data} labels={labels} t={t} tPre={tPre} />
  );

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
            _hover={{ bg: "background.neutral" }}
            leftIcon={
              <Icon
                as={panelOpen ? LuChevronLeft : LuSlidersHorizontal}
                boxSize="16px"
              />
            }
            onClick={() => setPanelOpen((v) => !v)}
            _focusVisible={FOCUS_RING}
          >
            {panelOpen ? t("next-customize-close") : t("next-customize")}
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
        maxW={panelOpen ? "1440px" : "1200px"}
      >
        {!isReady ? null : (
          <Grid
            templateColumns={{
              base: "1fr",
              lg: panelOpen ? "320px minmax(0, 1fr)" : "1fr",
            }}
            gap="xl"
            alignItems="start"
          >
            {panelOpen && !isNarrow && (
              <Box
                position="sticky"
                top="l"
                maxH="calc(100vh - 32px)"
                overflowY="auto"
                bg="base.light"
                borderRadius="rounded"
                boxShadow="1dp"
                p="xl"
              >
                {controls}
              </Box>
            )}
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
                title={t("next-section-list")}
                body={t("next-section-list-body")}
              >
                <RankedActionsTable
                  rows={rows}
                  cityOrder={cityOrder}
                  notRanked={footnote}
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
                  onAdjust={() => setPanelOpen(true)}
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
          </Grid>
        )}
      </Box>

      {panelOpen && isNarrow && (
        <Drawer.Root
          open
          onOpenChange={(e) => !e.open && setPanelOpen(false)}
          placement="start"
          size="sm"
        >
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content bg="base.light">
                <Drawer.Header
                  borderBottomWidth="1px"
                  borderColor="border.overlay"
                >
                  <HStack justifyContent="space-between">
                    <TitleMedium as="span" color="content.primary">
                      {t("next-customize")}
                    </TitleMedium>
                    <Drawer.CloseTrigger asChild>
                      <CloseButton
                        size="sm"
                        aria-label={t("next-drawer-close")}
                      />
                    </Drawer.CloseTrigger>
                  </HStack>
                </Drawer.Header>
                <Drawer.Body>{controls}</Drawer.Body>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
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
