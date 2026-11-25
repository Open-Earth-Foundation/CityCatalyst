import GlobalAPIService from "@/backend/GlobalAPIService";
import { db } from "@/models";
import {
  HighImpactActionRanked,
  HighImpactActionRankedAttributes,
} from "@/models/HighImpactActionRanked";
import { HighImpactActionRanking } from "@/models/HighImpactActionRanking";
import { HIAP_DEFAULT_PAGE_SIZE } from "@/backend/agentic/hiap/registry";
import { logger } from "@/services/logger";
import { getTranslationFromDictionary } from "@/util/helpers";
import {
  ACTION_TYPES,
  HighImpactActionRankingStatus,
  LANGUAGES,
} from "@/util/types";

type HiapAvailability = "available" | "pending" | "failed" | "missing";
type HiapSelectionMode =
  "city_selected" | "ranked_fallback" | "ranked_all" | "none";

export type HiapContextOptions = {
  scope?: "selected" | "ranked";
  type?: ACTION_TYPES;
  limit?: number;
  offset?: number;
};

/** Keeps a full ranking inside the 64 KB tool result bound. */
const MAX_CATEGORY_BYTES = 24 * 1024;

type ClimateActionRecord = Record<string, unknown>;

type HiapActionContext = {
  action_id: string;
  name: string;
  type: ACTION_TYPES;
  rank: number | null;
  selected: boolean;
  source: "ranked" | "unranked";
  language: string;
  description: string | null;
  sectors: string[];
  hazards: string[];
  primary_purposes: string[];
  timeline: string | null;
  investment_cost: string | null;
  explanation: string | null;
};

type HiapCategoryContext = {
  status: HiapAvailability;
  ranking_id: string | null;
  updated_at: string | null;
  language: string | null;
  selection_mode: HiapSelectionMode;
  counts: {
    ranked: number;
    selected: number;
    returned: number;
    // Only present when the call asked for a scope, limit or offset.
    total?: number;
    offset?: number;
  };
  truncated?: boolean;
  actions: HiapActionContext[];
};

type CategoryState = {
  type: ACTION_TYPES;
  requestedLanguage: LANGUAGES;
  status: HiapAvailability;
  ranking: HighImpactActionRanking | null;
  effectiveLanguage: string | null;
  rankedRows: HighImpactActionRanked[];
  selectedActionIds: Set<string>;
  selectedUnrankedActionIds: Set<string>;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function localizedString(value: unknown, language: string): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return getTranslationFromDictionary(
      value as Record<string, string>,
      language,
    );
  }
  return undefined;
}

function localizedExplanation(value: unknown, language: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const translations =
    record.explanations &&
    typeof record.explanations === "object" &&
    !Array.isArray(record.explanations)
      ? record.explanations
      : record;
  return localizedString(translations, language) ?? null;
}

function rankingAvailability(
  ranking: HighImpactActionRanking | null,
): HiapAvailability {
  if (!ranking) {
    return "missing";
  }
  if (
    ranking.status === HighImpactActionRankingStatus.PENDING ||
    ranking.status === HighImpactActionRankingStatus.TO_DO
  ) {
    return "pending";
  }
  if (ranking.status === HighImpactActionRankingStatus.FAILURE) {
    return "failed";
  }
  return "missing";
}

function chooseEffectiveLanguage(
  rows: HighImpactActionRanked[],
  requestedLanguage: LANGUAGES,
): string | null {
  const languages = [...new Set(rows.map((row) => row.lang))].sort();
  if (languages.includes(requestedLanguage)) {
    return requestedLanguage;
  }
  if (languages.includes(LANGUAGES.en)) {
    return LANGUAGES.en;
  }
  return languages[0] ?? null;
}

function preferredRankedRow(
  rows: HighImpactActionRanked[],
  effectiveLanguage: string | null,
): HighImpactActionRanked {
  return [...rows].sort((left, right) => {
    const leftPreferred = left.lang === effectiveLanguage ? 0 : 1;
    const rightPreferred = right.lang === effectiveLanguage ? 0 : 1;
    return (
      leftPreferred - rightPreferred ||
      left.lang.localeCompare(right.lang) ||
      left.rank - right.rank ||
      left.id.localeCompare(right.id)
    );
  })[0];
}

function rankedActionContext(
  row: HighImpactActionRanked,
  selected: boolean,
): HiapActionContext {
  const action = row.toJSON() as HighImpactActionRankedAttributes;
  return {
    action_id: action.actionId,
    name: action.name,
    type: action.type as ACTION_TYPES,
    rank: action.rank,
    selected,
    source: "ranked",
    language: action.lang,
    description: action.description ?? null,
    sectors: action.sectors ?? [],
    hazards: action.hazards ?? [],
    primary_purposes: action.primaryPurposes ?? [],
    timeline: action.timelineForImplementation ?? null,
    investment_cost: action.costInvestmentNeeded ?? null,
    explanation: localizedExplanation(action.explanation, action.lang),
  };
}

function unrankedActionContext(
  actionId: string,
  type: ACTION_TYPES,
  language: LANGUAGES,
  catalogueById: Map<string, ClimateActionRecord>,
): HiapActionContext {
  const action = catalogueById.get(actionId);
  return {
    action_id: actionId,
    name: localizedString(action?.ActionName, language) ?? actionId,
    type,
    rank: null,
    selected: true,
    source: "unranked",
    language,
    description: localizedString(action?.Description, language) ?? null,
    sectors: asStringArray(action?.Sector),
    hazards: asStringArray(action?.Hazard),
    primary_purposes: asStringArray(action?.PrimaryPurpose),
    timeline:
      asString(action?.TimelineForImplementation) ??
      asString(action?.Timeline) ??
      null,
    investment_cost:
      asString(action?.CostInvestmentNeeded) ?? asString(action?.Cost) ?? null,
    explanation: localizedString(action?.Explanation, language) ?? null,
  };
}

async function loadCategoryState(
  inventoryId: string,
  type: ACTION_TYPES,
  requestedLanguage: LANGUAGES,
): Promise<CategoryState> {
  const [successfulRanking, selectedUnrankedRows] = await Promise.all([
    db.models.HighImpactActionRanking.findOne({
      where: {
        inventoryId,
        type,
        status: HighImpactActionRankingStatus.SUCCESS,
      },
      order: [
        ["created", "DESC"],
        ["id", "ASC"],
      ],
    }),
    db.models.UnrankedActionSelection.findAll({
      where: {
        inventoryId,
        actionType: type,
        isSelected: true,
      },
      order: [
        ["actionId", "ASC"],
        ["lang", "ASC"],
      ],
    }),
  ]);

  const selectedUnrankedActionIds = new Set(
    selectedUnrankedRows.map((row) => row.actionId),
  );
  if (!successfulRanking) {
    const latestRanking = await db.models.HighImpactActionRanking.findOne({
      where: { inventoryId, type },
      order: [
        ["created", "DESC"],
        ["id", "ASC"],
      ],
    });
    return {
      type,
      requestedLanguage,
      status:
        selectedUnrankedActionIds.size > 0
          ? "available"
          : rankingAvailability(latestRanking),
      ranking: null,
      effectiveLanguage: null,
      rankedRows: [],
      selectedActionIds: new Set(),
      selectedUnrankedActionIds,
    };
  }

  const rankedRows = await db.models.HighImpactActionRanked.findAll({
    where: {
      hiaRankingId: successfulRanking.id,
      type,
    },
    order: [
      ["rank", "ASC"],
      ["lang", "ASC"],
      ["id", "ASC"],
    ],
  });
  return {
    type,
    requestedLanguage,
    status: "available",
    ranking: successfulRanking,
    effectiveLanguage: chooseEffectiveLanguage(rankedRows, requestedLanguage),
    rankedRows,
    selectedActionIds: new Set(
      rankedRows.filter((row) => row.isSelected).map((row) => row.actionId),
    ),
    selectedUnrankedActionIds,
  };
}

function buildCategoryContext(
  state: CategoryState,
  catalogueById: Map<string, ClimateActionRecord>,
  options: HiapContextOptions = {},
): HiapCategoryContext {
  const rowsByActionId = new Map<string, HighImpactActionRanked[]>();
  for (const row of state.rankedRows) {
    const existing = rowsByActionId.get(row.actionId) ?? [];
    existing.push(row);
    rowsByActionId.set(row.actionId, existing);
  }

  const selectedIds = new Set([
    ...state.selectedActionIds,
    ...state.selectedUnrankedActionIds,
  ]);
  const hasCitySelection = selectedIds.size > 0;
  // "ranked" lists the ranking whether or not actions are selected; "selected"
  // never falls back to the ranking; no scope keeps the original behavior.
  const rankedView = options.scope === "ranked";
  const selectedOnly = options.scope === "selected";
  const rankedRows = [...rowsByActionId.values()]
    .map((rows) => preferredRankedRow(rows, state.effectiveLanguage))
    .filter(
      (row) =>
        rankedView ||
        !hasCitySelection ||
        state.selectedActionIds.has(row.actionId),
    )
    .filter((row) => !selectedOnly || state.selectedActionIds.has(row.actionId))
    .map((row) =>
      rankedActionContext(
        row,
        rankedView
          ? state.selectedActionIds.has(row.actionId)
          : hasCitySelection,
      ),
    );
  const unrankedActions = rankedView
    ? []
    : [...state.selectedUnrankedActionIds]
        .filter((actionId) => !state.selectedActionIds.has(actionId))
        .sort()
        .map((actionId) =>
          unrankedActionContext(
            actionId,
            state.type,
            state.requestedLanguage,
            catalogueById,
          ),
        );
  const allActions = [...rankedRows, ...unrankedActions].sort(
    (left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      left.action_id.localeCompare(right.action_id),
  );

  // The default projection is consumed by the Concept Note Builder, whose
  // models forbid extra fields and check `counts.returned == len(actions)`.
  // Keep it exactly as it was: no paging fields and no byte trim.
  const paged =
    options.scope !== undefined ||
    options.limit !== undefined ||
    options.offset !== undefined;
  if (!paged) {
    return {
      status: state.status,
      ranking_id: state.ranking?.id ?? null,
      updated_at: state.ranking?.lastUpdated?.toISOString() ?? null,
      language: state.effectiveLanguage ?? state.requestedLanguage,
      selection_mode: hasCitySelection
        ? "city_selected"
        : allActions.length > 0
          ? "ranked_fallback"
          : "none",
      counts: {
        ranked: rowsByActionId.size,
        selected: selectedIds.size,
        returned: allActions.length,
      },
      actions: allActions,
    };
  }

  // A ranked listing is paged; other views keep returning the whole list.
  const offset = options.offset ?? 0;
  const pageSize =
    options.limit ?? (rankedView ? HIAP_DEFAULT_PAGE_SIZE : allActions.length);
  let actions = allActions.slice(offset, offset + pageSize);
  // Drop the tail instead of failing the whole read when the output is large.
  while (
    actions.length > 1 &&
    Buffer.byteLength(JSON.stringify(actions), "utf8") > MAX_CATEGORY_BYTES
  ) {
    actions = actions.slice(0, -1);
  }

  return {
    status: state.status,
    ranking_id: state.ranking?.id ?? null,
    updated_at: state.ranking?.lastUpdated?.toISOString() ?? null,
    language: state.effectiveLanguage ?? state.requestedLanguage,
    selection_mode: rankedView
      ? "ranked_all"
      : hasCitySelection
        ? "city_selected"
        : selectedOnly || actions.length === 0
          ? "none"
          : "ranked_fallback",
    counts: {
      ranked: rowsByActionId.size,
      selected: selectedIds.size,
      returned: actions.length,
      total: allActions.length,
      offset,
    },
    truncated: offset + actions.length < allActions.length,
    actions,
  };
}

function overallAvailability(
  categories: HiapCategoryContext[],
): HiapAvailability {
  if (categories.some((category) => category.status === "available")) {
    return "available";
  }
  if (categories.some((category) => category.status === "pending")) {
    return "pending";
  }
  if (categories.some((category) => category.status === "failed")) {
    return "failed";
  }
  return "missing";
}

/**
 * Build compact persisted HIAP context without starting jobs, copying
 * translations, repairing selections, or writing product data.
 */
export async function buildHiapInventoryContext(
  inventoryId: string,
  requestedLanguage: LANGUAGES,
  options: HiapContextOptions = {},
) {
  const states = await Promise.all([
    options.type === ACTION_TYPES.Adaptation
      ? null
      : loadCategoryState(
          inventoryId,
          ACTION_TYPES.Mitigation,
          requestedLanguage,
        ),
    options.type === ACTION_TYPES.Mitigation
      ? null
      : loadCategoryState(
          inventoryId,
          ACTION_TYPES.Adaptation,
          requestedLanguage,
        ),
  ]);
  const selectedUnrankedIds = new Set(
    states.flatMap((state) =>
      state ? [...state.selectedUnrankedActionIds] : [],
    ),
  );
  let catalogueById = new Map<string, ClimateActionRecord>();

  if (selectedUnrankedIds.size > 0) {
    try {
      const catalogue = (await GlobalAPIService.fetchAllClimateActions(
        requestedLanguage,
      )) as unknown as ClimateActionRecord[];
      catalogueById = new Map(
        catalogue
          .filter((action) => typeof action.ActionID === "string")
          .map((action) => [action.ActionID as string, action]),
      );
    } catch (error) {
      logger.warn(
        { err: error, inventoryId, requestedLanguage },
        "Could not enrich selected unranked HIAP actions",
      );
    }
  }

  const mitigation = states[0]
    ? buildCategoryContext(states[0], catalogueById, options)
    : null;
  const adaptation = states[1]
    ? buildCategoryContext(states[1], catalogueById, options)
    : null;
  return {
    availability: overallAvailability(
      [mitigation, adaptation].filter(
        (category): category is HiapCategoryContext => category !== null,
      ),
    ),
    inventory_id: inventoryId,
    requested_language: requestedLanguage,
    // A category outside the requested type is omitted, not reported empty.
    ...(mitigation ? { mitigation } : {}),
    ...(adaptation ? { adaptation } : {}),
  };
}
