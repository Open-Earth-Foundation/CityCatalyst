"use client";
import React, { useMemo, useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  IconButton,
  Link,
  Separator,
  SimpleGrid,
  Table,
  Tag,
  VStack,
} from "@chakra-ui/react";
import {
  LuChevronDown,
  LuChevronRight,
  LuInbox,
  LuLandmark,
  LuMapPin,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityQuery,
  useGetMeedFinanceFeasibilityQuery,
  useGetMeedFinanceLinkQuery,
} from "@/services/api";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { MeedWizardPage } from "../../MeedWizardPage";
import { EmptyState } from "../results/components/EmptyState";

// ─── Local view of the Global API climate-finance responses ─────────────────
// (`useGetMeedFinanceFeasibilityQuery` / `useGetMeedFinanceLinkQuery` are typed
// `unknown` in the service layer — shapes mirror the MEED+ prototype.)

interface FeasibilityInputs {
  action?: { capital_intensity?: number; preparation_complexity?: number };
  city?: { profile?: string };
  finance?: { fund_access?: string; n_reachable_opportunities?: number };
  evidence?: { n_existing_projects?: number };
}

interface FeasibilityRow {
  action_id: string;
  action_name?: string;
  sector?: string | null;
  financial_feasibility: number;
  route?: string | null;
  reason?: string | null;
  inputs?: FeasibilityInputs | null;
  links?: { detail?: string; opportunities?: string; projects?: string } | null;
}

interface Opportunity {
  opportunity_name?: string;
  funder_name?: string;
  instrument?: string;
  status?: string;
  source_url?: string;
  amount_note?: string | null;
  notes?: string;
}

interface FundingSource {
  cycle?: string | number;
  funder_name?: string;
}

interface Project {
  project_name?: string;
  project_name_i18n?: { en?: string; es?: string };
  sector?: string;
  jurisdiction?: string;
  lifecycle_stage?: string;
  funding_channel?: string;
  cost_total?: number | null;
  funding_sources?: FundingSource[];
  action_matches?: { action_id: string; confidence?: string }[];
}

function extractFeasibilityRows(data: unknown): FeasibilityRow[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data &&
        typeof data === "object" &&
        Array.isArray((data as { data?: unknown[] }).data)
      ? ((data as { data: unknown[] }).data)
      : [];
  const rows = list.filter(
    (r): r is FeasibilityRow =>
      !!r &&
      typeof r === "object" &&
      typeof (r as FeasibilityRow).action_id === "string" &&
      typeof (r as FeasibilityRow).financial_feasibility === "number",
  );
  return [...rows].sort(
    (a, b) => b.financial_feasibility - a.financial_feasibility,
  );
}

function extractLinkedList<T>(data: unknown): { rows: T[]; total: number } {
  if (!data || typeof data !== "object") return { rows: [], total: 0 };
  const env = data as { data?: unknown; meta?: { total?: number } };
  const rows = Array.isArray(env.data) ? (env.data as T[]) : [];
  const total =
    typeof env.meta?.total === "number" ? env.meta.total : rows.length;
  return { rows, total };
}

// ─── Financing routes ─────────────────────────────────────────────────────────

type RouteKey = "self" | "cofinance" | "support" | "other";

const ROUTE_ORDER: RouteKey[] = ["self", "cofinance", "support", "other"];

const ROUTE_META: Record<
  RouteKey,
  { labelKey: string; taglineKey: string; palette: string }
> = {
  self: {
    labelKey: "route-self",
    taglineKey: "route-self-tagline",
    palette: "green",
  },
  cofinance: {
    labelKey: "route-cofinance",
    taglineKey: "route-cofinance-tagline",
    palette: "orange",
  },
  support: {
    labelKey: "route-support",
    taglineKey: "route-support-tagline",
    palette: "red",
  },
  other: {
    labelKey: "route-unknown",
    taglineKey: "route-unknown-tagline",
    palette: "gray",
  },
};

function routeKeyOf(route: string | null | undefined): RouteKey {
  const k = (route ?? "").toLowerCase();
  if (!k) return "other";
  if (
    k.includes("self-deliverable") ||
    k.includes("own-budget") ||
    k.includes("own budget")
  ) {
    return "self";
  }
  if (k.includes("co-finance")) return "cofinance";
  if (k.includes("pooling") || k.includes("ta /") || k.includes("support")) {
    return "support";
  }
  return "other";
}

// Actions the city can fund from its own budget don't need external financing;
// sector-level funds are reframed as optional (see the prototype's rationale).
function isSelfFundable(route: string | null | undefined): boolean {
  return routeKeyOf(route) === "self";
}

function RouteTag({
  routeKey,
  t,
}: {
  routeKey: RouteKey;
  t: TFunction;
}) {
  const meta = ROUTE_META[routeKey];
  return (
    <Tag.Root colorPalette={meta.palette} size="sm">
      <Tag.Label>{t(meta.labelKey)}</Tag.Label>
    </Tag.Root>
  );
}

// ─── Levels & profile ─────────────────────────────────────────────────────────

type Level = "low" | "lower" | "medium" | "high" | "higher";

const LEVEL_KEYS: Record<Level, string> = {
  low: "level-low",
  lower: "level-lower",
  medium: "level-medium",
  high: "level-high",
  higher: "level-higher",
};

const LEVEL_PCT: Record<Level, number> = {
  low: 20,
  lower: 30,
  medium: 50,
  high: 80,
  higher: 95,
};

function numericToLevel(v: number | undefined | null): Level | undefined {
  if (v === undefined || v === null) return undefined;
  if (v <= 0.33) return "low";
  if (v <= 0.67) return "medium";
  return "high";
}

/**
 * Color token for a level. `needs` factors (capital intensity, preparation
 * complexity) are good when low; `has` factors (autonomy, capacity) are good
 * when high.
 */
function levelToken(level: Level, dir: "needs" | "has"): string {
  if (dir === "needs") {
    if (level === "low" || level === "lower") return "sentiment.positiveDefault";
    if (level === "medium") return "sentiment.warningDefault";
    return "sentiment.negativeDefault";
  }
  if (level === "high" || level === "higher") return "sentiment.positiveDefault";
  return "sentiment.warningDefault";
}

interface ProfileAttrs {
  labelKey: string;
  descKey: string;
  fa?: Level;
  dc?: Level;
}

function profileAttrs(profile: string | undefined): ProfileAttrs {
  const p = (profile ?? "").toLowerCase().replace(/_/g, "-");
  if (p.includes("delivery-ready")) {
    return {
      labelKey: "profile-delivery-ready",
      descKey: "profile-delivery-ready-desc",
      fa: "lower",
      dc: "high",
    };
  }
  if (p.includes("financially-strong") || p.includes("self-sufficient")) {
    return {
      labelKey: "profile-financially-strong",
      descKey: "profile-financially-strong-desc",
      fa: "high",
      dc: "high",
    };
  }
  if (p.includes("revenue-strong")) {
    return {
      labelKey: "profile-revenue-strong",
      descKey: "profile-revenue-strong-desc",
      fa: "high",
      dc: "lower",
    };
  }
  if (p.includes("capacity-rich")) {
    return {
      labelKey: "profile-capacity-rich",
      descKey: "profile-capacity-rich-desc",
      fa: "lower",
      dc: "higher",
    };
  }
  return {
    labelKey: "profile-transitioning",
    descKey: "profile-transitioning-desc",
  };
}

// ─── Small display helpers ────────────────────────────────────────────────────

function scoreColorToken(v: number): string {
  if (v >= 0.7) return "sentiment.positiveDefault";
  if (v >= 0.4) return "sentiment.warningDefault";
  return "content.tertiary";
}

/** Humanize a data enum (e.g. "stationary_energy" → "Stationary Energy"). */
function humanizeEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_KEYS: Record<string, string> = {
  open: "status-open",
  ongoing: "status-ongoing",
  closed: "status-closed",
};

const STATUS_PALETTE: Record<string, string> = {
  open: "blue",
  ongoing: "green",
  closed: "gray",
};

function lifecyclePalette(stage: string | undefined): string {
  const l = (stage ?? "").toLowerCase();
  if (l.includes("execut") || l.includes("progress") || l.includes("ongoing")) {
    return "orange";
  }
  if (l.includes("complet") || l.includes("finish")) return "green";
  if (l.includes("plan") || l.includes("formul")) return "blue";
  return "gray";
}

function confidenceMeta(confidence: string | undefined): {
  labelKey: string;
  palette: string;
} {
  const l = (confidence ?? "").toLowerCase();
  if (l.includes("strong")) return { labelKey: "match-strong", palette: "green" };
  if (l.includes("goal")) return { labelKey: "match-goal", palette: "teal" };
  return { labelKey: "match-matched", palette: "blue" };
}

// cost_total is in CLP millions per the API (amount_unit: "CLP_millions").
function formatClpMillions(
  val: number | null | undefined,
  t: TFunction,
): string | null {
  if (!val || val <= 0) return null;
  if (val >= 1_000_000) {
    return t("amount-clp-t", { value: (val / 1_000_000).toFixed(1) });
  }
  if (val >= 1_000) {
    return t("amount-clp-b", { value: (val / 1_000).toFixed(1) });
  }
  return t("amount-clp-m", { value: Math.round(val) });
}

function withLimit(link: string, limit: number): string {
  return `${link}${link.includes("?") ? "&" : "?"}limit=${limit}`;
}

const INITIAL_ROWS = 15;
const INITIAL_OPPS = 2;
const INITIAL_PROJECTS = 3;

// ─── City profile card ────────────────────────────────────────────────────────

function FactorLevel({
  label,
  level,
  dir,
  t,
}: {
  label: string;
  level: Level;
  dir: "needs" | "has";
  t: TFunction;
}) {
  const color = levelToken(level, dir);
  return (
    <VStack alignItems="stretch" gap="6px">
      <BodyMedium color="content.secondary">{label}</BodyMedium>
      <HStack gap="8px">
        <Box
          flex="1"
          h="6px"
          bg="background.neutral"
          borderRadius="full"
          overflow="hidden"
        >
          <Box
            h="full"
            w={`${LEVEL_PCT[level]}%`}
            bg={color}
            borderRadius="full"
          />
        </Box>
        <LabelLarge color={color}>{t(LEVEL_KEYS[level])}</LabelLarge>
      </HStack>
    </VStack>
  );
}

function CityProfileCard({
  cityName,
  profile,
  t,
}: {
  cityName: string;
  profile: ProfileAttrs;
  t: TFunction;
}) {
  return (
    <Card.Root>
      <Card.Body p="24px">
        <VStack alignItems="stretch" gap="16px">
          <TitleMedium color="content.primary">
            {t("financial-profile-title", { city: cityName })}
          </TitleMedium>

          <HStack
            gap="12px"
            bg="background.neutral"
            borderRadius="8px"
            px="16px"
            py="12px"
            alignItems="flex-start"
          >
            <Icon
              as={LuLandmark}
              boxSize="20px"
              color="content.secondary"
              mt="2px"
            />
            <VStack alignItems="flex-start" gap="4px">
              <LabelLarge color="content.primary">
                {t(profile.labelKey)}
              </LabelLarge>
              <BodyMedium color="content.secondary">
                {t(profile.descKey, { city: cityName })}
              </BodyMedium>
            </VStack>
          </HStack>

          {(profile.fa || profile.dc) && (
            <SimpleGrid columns={{ base: 1, sm: 2 }} gap="16px">
              {profile.fa && (
                <FactorLevel
                  label={t("factor-financial-autonomy")}
                  level={profile.fa}
                  dir="has"
                  t={t}
                />
              )}
              {profile.dc && (
                <FactorLevel
                  label={t("factor-delivery-capacity")}
                  level={profile.dc}
                  dir="has"
                  t={t}
                />
              )}
            </SimpleGrid>
          )}

          <VStack alignItems="stretch" gap="8px">
            <LabelLarge color="content.tertiary">
              {t("route-legend-title")}
            </LabelLarge>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="12px">
              {(["self", "cofinance", "support"] as const).map((key) => (
                <Box
                  key={key}
                  borderWidth="1px"
                  borderColor="divider.neutral"
                  borderRadius="8px"
                  p="12px"
                >
                  <VStack alignItems="flex-start" gap="6px">
                    <RouteTag routeKey={key} t={t} />
                    <BodyMedium fontSize="xs" color="content.secondary">
                      {t(ROUTE_META[key].taglineKey)}
                    </BodyMedium>
                  </VStack>
                </Box>
              ))}
            </SimpleGrid>
          </VStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

// ─── Expanded row detail ──────────────────────────────────────────────────────

function DetailEmpty({ title, body }: { title: string; body: string }) {
  return (
    <Box
      borderWidth="1px"
      borderColor="divider.neutral"
      borderRadius="8px"
      py="24px"
      px="16px"
    >
      <VStack gap="8px" textAlign="center" maxW="360px" mx="auto">
        <Icon as={LuInbox} boxSize="24px" color="content.tertiary" />
        <LabelLarge color="content.primary">{title}</LabelLarge>
        <BodyMedium fontSize="xs" color="content.tertiary">
          {body}
        </BodyMedium>
      </VStack>
    </Box>
  );
}

function FactorReadout({
  label,
  level,
  dir,
  t,
}: {
  label: string;
  level: Level;
  dir: "needs" | "has";
  t: TFunction;
}) {
  return (
    <HStack justifyContent="space-between">
      <BodyMedium color="content.secondary">{label}</BodyMedium>
      <LabelLarge color={levelToken(level, dir)}>
        {t(LEVEL_KEYS[level])}
      </LabelLarge>
    </HStack>
  );
}

function OpportunityCard({ opp, t }: { opp: Opportunity; t: TFunction }) {
  const status = (opp.status ?? "").toLowerCase();
  const statusKey = STATUS_KEYS[status];
  const snippet = opp.amount_note ?? opp.notes ?? "";
  return (
    <Box
      borderWidth="1px"
      borderColor="divider.neutral"
      borderRadius="8px"
      p="12px"
    >
      <VStack alignItems="stretch" gap="4px">
        <HStack justifyContent="space-between" alignItems="flex-start" gap="8px">
          <BodyMedium color="content.primary" fontWeight="semibold">
            {opp.opportunity_name ?? t("opportunity-fallback-name")}
          </BodyMedium>
          <HStack gap="4px" flexShrink={0}>
            {statusKey && (
              <Tag.Root
                colorPalette={STATUS_PALETTE[status] ?? "gray"}
                size="sm"
              >
                <Tag.Label>{t(statusKey)}</Tag.Label>
              </Tag.Root>
            )}
            {opp.instrument && (
              <Tag.Root colorPalette="gray" size="sm">
                <Tag.Label>{humanizeEnum(opp.instrument)}</Tag.Label>
              </Tag.Root>
            )}
          </HStack>
        </HStack>
        {opp.funder_name && (
          <BodyMedium fontSize="xs" color="content.tertiary">
            {opp.funder_name}
          </BodyMedium>
        )}
        {snippet && (
          <BodyMedium fontSize="xs" color="content.secondary">
            {snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet}
          </BodyMedium>
        )}
        {opp.source_url && (
          <Link
            href={opp.source_url}
            target="_blank"
            rel="noopener noreferrer"
            color="content.link"
            fontSize="xs"
            fontWeight="semibold"
            alignSelf="flex-start"
          >
            {t("view-fund")}
          </Link>
        )}
      </VStack>
    </Box>
  );
}

function ProjectCard({ proj, t }: { proj: Project; t: TFunction }) {
  const conf = proj.action_matches?.[0]
    ? confidenceMeta(proj.action_matches[0].confidence)
    : null;
  const cost = formatClpMillions(proj.cost_total, t);
  const funder = proj.funding_sources?.[0]?.funder_name;
  const name =
    proj.project_name_i18n?.en ??
    proj.project_name ??
    t("project-fallback-name");
  return (
    <Box
      borderWidth="1px"
      borderColor="divider.neutral"
      borderRadius="8px"
      p="12px"
    >
      <VStack alignItems="stretch" gap="4px">
        <HStack justifyContent="space-between" alignItems="flex-start" gap="8px">
          <BodyMedium color="content.primary" fontWeight="semibold">
            {name}
          </BodyMedium>
          <HStack gap="4px" flexShrink={0}>
            {conf && (
              <Tag.Root colorPalette={conf.palette} size="sm">
                <Tag.Label>{t(conf.labelKey)}</Tag.Label>
              </Tag.Root>
            )}
            {proj.lifecycle_stage && (
              <Tag.Root
                colorPalette={lifecyclePalette(proj.lifecycle_stage)}
                size="sm"
              >
                <Tag.Label>{humanizeEnum(proj.lifecycle_stage)}</Tag.Label>
              </Tag.Root>
            )}
          </HStack>
        </HStack>
        {proj.jurisdiction && (
          <HStack gap="4px">
            <Icon as={LuMapPin} boxSize="12px" color="content.tertiary" />
            <BodyMedium fontSize="xs" color="content.tertiary">
              {proj.jurisdiction}
            </BodyMedium>
          </HStack>
        )}
        <HStack gap="16px" flexWrap="wrap">
          {cost && (
            <BodyMedium fontSize="xs" color="content.secondary">
              {t("label-cost")}{" "}
              <Box as="span" fontWeight="semibold">
                {cost}
              </Box>
            </BodyMedium>
          )}
          {proj.sector && (
            <BodyMedium fontSize="xs" color="content.secondary">
              {t("label-sector")}{" "}
              <Box as="span" fontWeight="semibold">
                {humanizeEnum(proj.sector)}
              </Box>
            </BodyMedium>
          )}
          {proj.funding_channel && (
            <BodyMedium fontSize="xs" color="content.secondary">
              {t("label-channel")}{" "}
              <Box as="span" fontWeight="semibold">
                {humanizeEnum(proj.funding_channel)}
              </Box>
            </BodyMedium>
          )}
          {funder && (
            <BodyMedium fontSize="xs" color="content.secondary">
              {t("label-funder")}{" "}
              <Box as="span" fontWeight="semibold">
                {funder}
              </Box>
            </BodyMedium>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}

/**
 * Detail for an expanded feasibility row: route reasoning, factor breakdown,
 * and lazily-fetched funding opportunities and funded projects (via the
 * row's relative Global-API links).
 */
function RowDetail({
  row,
  cityId,
  cityName,
  t,
}: {
  row: FeasibilityRow;
  cityId: string;
  cityName: string;
  t: TFunction;
}) {
  const [showAllOpps, setShowAllOpps] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const oppLink = row.links?.opportunities;
  const projLink = row.links?.projects;

  const { data: oppData, isLoading: oppsLoading } = useGetMeedFinanceLinkQuery(
    { cityId, link: oppLink ?? "" },
    { skip: !oppLink },
  );
  const { data: projData, isLoading: projectsLoading } =
    useGetMeedFinanceLinkQuery(
      { cityId, link: projLink ? withLimit(projLink, 50) : "" },
      { skip: !projLink },
    );

  const opportunities = useMemo(
    () => extractLinkedList<Opportunity>(oppData),
    [oppData],
  );
  const projects = useMemo(
    () => extractLinkedList<Project>(projData),
    [projData],
  );

  const selfFundable = isSelfFundable(row.route);
  const inputs = row.inputs ?? {};
  const ciLevel = numericToLevel(inputs.action?.capital_intensity);
  const pcLevel = numericToLevel(inputs.action?.preparation_complexity);
  const profile = profileAttrs(inputs.city?.profile);

  const visibleOpps = showAllOpps
    ? opportunities.rows
    : opportunities.rows.slice(0, INITIAL_OPPS);
  const visibleProjects = showAllProjects
    ? projects.rows
    : projects.rows.slice(0, INITIAL_PROJECTS);

  return (
    <VStack alignItems="stretch" gap="16px" py="8px" pl="32px" pr="8px">
      {row.reason && (
        <BodyMedium color="content.secondary">{row.reason}</BodyMedium>
      )}

      {(ciLevel || pcLevel || profile.fa || profile.dc) && (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="16px">
          {(ciLevel || pcLevel) && (
            <VStack alignItems="stretch" gap="8px">
              <LabelLarge color="content.tertiary">
                {t("what-action-needs")}
              </LabelLarge>
              {ciLevel && (
                <FactorReadout
                  label={t("factor-capital-intensity")}
                  level={ciLevel}
                  dir="needs"
                  t={t}
                />
              )}
              {pcLevel && (
                <FactorReadout
                  label={t("factor-preparation-complexity")}
                  level={pcLevel}
                  dir="needs"
                  t={t}
                />
              )}
            </VStack>
          )}
          {(profile.fa || profile.dc) && (
            <VStack alignItems="stretch" gap="8px">
              <LabelLarge color="content.tertiary">
                {t("what-city-has", { city: cityName })}
              </LabelLarge>
              {profile.fa && (
                <FactorReadout
                  label={t("factor-financial-autonomy")}
                  level={profile.fa}
                  dir="has"
                  t={t}
                />
              )}
              {profile.dc && (
                <FactorReadout
                  label={t("factor-delivery-capacity")}
                  level={profile.dc}
                  dir="has"
                  t={t}
                />
              )}
            </VStack>
          )}
        </SimpleGrid>
      )}

      <Separator borderColor="divider.neutral" />

      {/* Funding opportunities */}
      <VStack alignItems="stretch" gap="8px">
        <HStack justifyContent="space-between">
          <LabelLarge color="content.tertiary">
            {t("fund-access-title")}
          </LabelLarge>
          {selfFundable ? (
            <Tag.Root colorPalette="green" size="sm">
              <Tag.Label>{t("fundable-own-budget")}</Tag.Label>
            </Tag.Root>
          ) : (
            opportunities.rows.length > 0 && (
              <Tag.Root colorPalette="gray" size="sm">
                <Tag.Label>
                  {t("direct-funds-count", {
                    n:
                      inputs.finance?.n_reachable_opportunities ??
                      opportunities.rows.length,
                  })}
                </Tag.Label>
              </Tag.Root>
            )
          )}
        </HStack>

        {selfFundable && (
          <Box
            bg="sentiment.positiveOverlay"
            borderRadius="8px"
            px="12px"
            py="10px"
          >
            <BodyMedium color="content.secondary">
              {t("self-fundable-note")}
            </BodyMedium>
          </Box>
        )}

        {oppsLoading ? (
          <BodyMedium color="content.tertiary">
            {t("loading-detail")}
          </BodyMedium>
        ) : opportunities.rows.length === 0 ? (
          <DetailEmpty
            title={t("no-opportunities-title")}
            body={t("no-opportunities-body")}
          />
        ) : (
          <>
            {visibleOpps.map((opp, i) => (
              <OpportunityCard key={`opp-${i}`} opp={opp} t={t} />
            ))}
            {opportunities.rows.length > INITIAL_OPPS && (
              <CCTerraButton
                variant="text"
                alignSelf="flex-start"
                minW="auto"
                h="32px"
                px="8px"
                onClick={() => setShowAllOpps((v) => !v)}
              >
                {showAllOpps
                  ? t("show-fewer-funds")
                  : t("show-all-funds", { n: opportunities.rows.length })}
              </CCTerraButton>
            )}
          </>
        )}
      </VStack>

      <Separator borderColor="divider.neutral" />

      {/* Matched projects */}
      <VStack alignItems="stretch" gap="8px">
        <HStack justifyContent="space-between">
          <LabelLarge color="content.tertiary">
            {t("matched-projects-title")}
          </LabelLarge>
          {!projectsLoading && projects.rows.length > 0 && (
            <Tag.Root colorPalette="gray" size="sm">
              <Tag.Label>
                {t("projects-total", { n: projects.total })}
              </Tag.Label>
            </Tag.Root>
          )}
        </HStack>

        {projectsLoading ? (
          <BodyMedium color="content.tertiary">
            {t("loading-detail")}
          </BodyMedium>
        ) : projects.rows.length === 0 ? (
          <DetailEmpty
            title={t("no-projects-title")}
            body={t("no-projects-body")}
          />
        ) : (
          <>
            {visibleProjects.map((proj, i) => (
              <ProjectCard key={`proj-${i}`} proj={proj} t={t} />
            ))}
            {projects.rows.length > INITIAL_PROJECTS && (
              <CCTerraButton
                variant="text"
                alignSelf="flex-start"
                minW="auto"
                h="32px"
                px="8px"
                onClick={() => setShowAllProjects((v) => !v)}
              >
                {showAllProjects
                  ? t("show-fewer-projects")
                  : t("show-all-projects", { n: projects.rows.length })}
              </CCTerraButton>
            )}
            {projects.total > projects.rows.length && (
              <BodyMedium fontSize="xs" color="content.tertiary">
                {t("projects-page-note", {
                  shown: projects.rows.length,
                  total: projects.total,
                })}
              </BodyMedium>
            )}
          </>
        )}
      </VStack>
    </VStack>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function FeasibilityTableRow({
  row,
  expanded,
  onToggle,
  cityId,
  cityName,
  t,
}: {
  row: FeasibilityRow;
  expanded: boolean;
  onToggle: () => void;
  cityId: string;
  cityName: string;
  t: TFunction;
}) {
  const routeKey = routeKeyOf(row.route);
  const selfFundable = routeKey === "self";
  const fundCount = row.inputs?.finance?.n_reachable_opportunities ?? 0;

  return (
    <>
      <Table.Row>
        <Table.Cell>
          <HStack gap="8px">
            <IconButton
              aria-label={t(expanded ? "collapse-row" : "expand-row")}
              size="2xs"
              variant="ghost"
              onClick={onToggle}
            >
              <Icon as={expanded ? LuChevronDown : LuChevronRight} />
            </IconButton>
            <BodyMedium color="content.primary">
              {row.action_name ?? row.action_id}
            </BodyMedium>
          </HStack>
        </Table.Cell>
        <Table.Cell whiteSpace="nowrap">
          <BodyMedium color="content.tertiary">
            {humanizeEnum(row.sector)}
          </BodyMedium>
        </Table.Cell>
        <Table.Cell whiteSpace="nowrap">
          <RouteTag routeKey={routeKey} t={t} />
        </Table.Cell>
        <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
          <BodyMedium
            color={scoreColorToken(row.financial_feasibility)}
            fontWeight="semibold"
          >
            {row.financial_feasibility.toFixed(2)}
          </BodyMedium>
        </Table.Cell>
        <Table.Cell textAlign="end" whiteSpace="nowrap">
          <BodyMedium
            color={
              selfFundable || fundCount === 0
                ? "content.tertiary"
                : "content.primary"
            }
          >
            {selfFundable
              ? t("fund-access-self")
              : fundCount > 0
                ? t("fund-access-direct", { n: fundCount })
                : "—"}
          </BodyMedium>
        </Table.Cell>
      </Table.Row>
      {expanded && (
        <Table.Row bg="background.backgroundLight">
          <Table.Cell colSpan={5}>
            <RowDetail row={row} cityId={cityId} cityName={cityName} t={t} />
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function FinancialFeasibilityContent(props: { lng: string; cityId: string }) {
  const { lng, cityId } = props;
  const { t } = useTranslation(lng, "meed-finance");

  const { data, isLoading } = useGetMeedFinanceFeasibilityQuery(
    { cityId },
    { skip: !cityId },
  );
  const { data: city } = useGetCityQuery(cityId, { skip: !cityId });

  const [activeRoute, setActiveRoute] = useState<RouteKey | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => extractFeasibilityRows(data), [data]);

  const routeCounts = useMemo(() => {
    const counts: Partial<Record<RouteKey, number>> = {};
    for (const row of rows) {
      const key = routeKeyOf(row.route);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(
    () =>
      activeRoute
        ? rows.filter((row) => routeKeyOf(row.route) === activeRoute)
        : rows,
    [rows, activeRoute],
  );

  const cityName = city?.name ?? t("the-city");

  if (isLoading) {
    return (
      <Card.Root>
        <Card.Body>
          <BodyLarge color="content.tertiary">{t("loading-finance")}</BodyLarge>
        </Card.Body>
      </Card.Root>
    );
  }

  if (rows.length === 0) {
    return (
      <VStack alignItems="stretch" gap="24px">
        <BodyLarge color="content.secondary">
          {t("finance-description", { city: cityName })}
        </BodyLarge>
        <EmptyState
          title={t("no-finance-title")}
          body={t("no-finance-description")}
        />
      </VStack>
    );
  }

  const visibleRows = showAll ? filtered : filtered.slice(0, INITIAL_ROWS);

  return (
    <VStack alignItems="stretch" gap="24px">
      <BodyLarge color="content.secondary">
        {t("finance-description", { city: cityName })}
      </BodyLarge>

      <CityProfileCard
        cityName={cityName}
        profile={profileAttrs(rows[0]?.inputs?.city?.profile)}
        t={t}
      />

      <VStack alignItems="stretch" gap="4px">
        <TitleMedium color="content.primary">{t("table-title")}</TitleMedium>
        <BodyMedium color="content.tertiary">
          {t("table-description")}
        </BodyMedium>
      </VStack>

      <HStack gap="8px" flexWrap="wrap">
        <CCTerraButton
          variant={activeRoute === null ? "filled" : "outlined"}
          minW="auto"
          h="36px"
          px="16px"
          onClick={() => setActiveRoute(null)}
        >
          {t("filter-all", { n: rows.length })}
        </CCTerraButton>
        {ROUTE_ORDER.filter((key) => (routeCounts[key] ?? 0) > 0).map((key) => (
          <CCTerraButton
            key={key}
            variant={activeRoute === key ? "filled" : "outlined"}
            minW="auto"
            h="36px"
            px="16px"
            onClick={() => setActiveRoute(activeRoute === key ? null : key)}
          >
            {`${t(ROUTE_META[key].labelKey)} · ${routeCounts[key]}`}
          </CCTerraButton>
        ))}
      </HStack>

      <Card.Root overflow="hidden">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("column-action")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("column-sector")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("column-route")}</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-score")}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-fund-access")}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleRows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <BodyMedium color="content.tertiary" textAlign="center">
                    {t("no-route-matches")}
                  </BodyMedium>
                </Table.Cell>
              </Table.Row>
            ) : (
              visibleRows.map((row) => (
                <FeasibilityTableRow
                  key={row.action_id}
                  row={row}
                  expanded={expandedId === row.action_id}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === row.action_id ? null : row.action_id,
                    )
                  }
                  cityId={cityId}
                  cityName={cityName}
                  t={t}
                />
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Card.Root>

      <HStack justifyContent="space-between" flexWrap="wrap">
        <BodyMedium color="content.tertiary">{t("sorted-note")}</BodyMedium>
        {filtered.length > INITIAL_ROWS && (
          <CCTerraButton variant="text" onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? t("show-fewer-actions")
              : t("show-more-actions", { n: filtered.length })}
          </CCTerraButton>
        )}
      </HStack>
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="finance">
      <FinancialFeasibilityContent lng={lng} cityId={cityId} />
    </MeedWizardPage>
  );
}
