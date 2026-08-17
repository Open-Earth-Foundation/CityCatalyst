import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import { db } from "@/models";
import type { ActionPlan } from "@/models/ActionPlan";
import type { HighImpactActionRanked } from "@/models/HighImpactActionRanked";
import type { HighImpactActionRanking } from "@/models/HighImpactActionRanking";
import type { ImportedInventoryFile } from "@/models/ImportedInventoryFile";
import type { NativeInputCatalog } from "@/models/NativeInputCatalog";
import type { PdfOcrJob } from "@/models/PdfOcrJob";
import type { UnrankedActionSelection } from "@/models/UnrankedActionSelection";
import {
  buildGHGIImportedInventorySourceInput,
  buildGHGIInventoryInput,
  buildGHGIOcrArtifactInput,
} from "@/backend/GHGINativeInputCatalogService";
import {
  buildHIAPActionPlanInput,
  buildHIAPRankingInput,
  buildHIAPSelectionInput,
  resolveHIAPCatalogScope,
} from "@/backend/hiap/HiapNativeInputCatalogService";
import {
  registerNativeInput,
  type RegisterNativeInputInput,
} from "@/backend/NativeInputCatalogService";
import type { ACTION_TYPES } from "@/util/types";
import { HighImpactActionRankingStatus } from "@/util/types";
import { ImportStatusEnum } from "@/util/enums";
import { logger } from "@/services/logger";

export const RECONCILIATION_MODES = ["dry-run", "apply"] as const;
export type ReconciliationMode = (typeof RECONCILIATION_MODES)[number];

export const RECONCILIATION_OUTCOMES = [
  "matched",
  "missing",
  "repaired",
  "skipped",
  "duplicate",
  "dangling",
  "scope-inconsistent",
  "ambiguous",
  "failed",
] as const;
export type ReconciliationOutcome = (typeof RECONCILIATION_OUTCOMES)[number];

const PRODUCERS = ["ghgi", "hiap"] as const;
type Producer = (typeof PRODUCERS)[number];

const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_MAX_PAGES = 100;
export const MAX_RECONCILIATION_PAGE_SIZE = 1000;
export const MAX_RECONCILIATION_PAGES = 1000;
const SCOPE_FIELDS = [
  "userId",
  "inventoryId",
  "cityId",
  "projectId",
  "organizationId",
] as const;
type ScopeField = (typeof SCOPE_FIELDS)[number];

const STREAM_NAMES = [
  "ghgiImportedFiles",
  "ghgiCompletedImports",
  "ghgiOcrJobs",
  "hiapRankings",
  "hiapRankedSelections",
  "hiapActionPlans",
  "hiapUnrankedSelections",
  "catalog",
] as const;
type StreamName = (typeof STREAM_NAMES)[number];

type PageCursor = {
  created: Date;
  id: string;
};

type StreamState = {
  cursor: PageCursor | null;
  done: boolean;
};

type Candidate = {
  producer: Producer;
  input: RegisterNativeInputInput;
};

type CollectionItem = {
  producer: Producer;
  outcome: "ambiguous" | "dangling" | "failed" | "skipped";
  sourceType?: string;
  sourceId?: string;
  reason: string;
};

type StreamPage = {
  stream: StreamName;
  rows: ReconciliationRow[];
  nextCursor: PageCursor | null;
  hasMore: boolean;
};

type ReconciliationRow = {
  id: string;
  created: Date | string;
  [key: string]: unknown;
};

type PageCollection = {
  candidates: Candidate[];
  items: CollectionItem[];
  catalogEntries: NativeInputCatalog[];
  withdrawnCatalogEntries: NativeInputCatalog[];
  streams: StreamPage[];
  recordsScanned: number;
};

export interface ReconciliationPageSummary {
  pageNumber: number;
  recordsScanned: number;
  streams: Array<{
    stream: StreamName;
    recordsFetched: number;
    hasMore: boolean;
  }>;
}

export interface ReconciliationReportItem {
  producer: Producer | "system";
  outcome: ReconciliationOutcome;
  sourceType?: string;
  sourceId?: string;
  catalogIds?: string[];
  catalogId?: string;
  reason?: string;
}

export interface NativeInputCatalogReconciliationReport {
  runId: string;
  mode: ReconciliationMode;
  pageSize: number;
  maxPages: number;
  pagesProcessed: number;
  recordsScanned: number;
  complete: boolean;
  truncated: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  counts: Record<ReconciliationOutcome, number>;
  pageSummaries: ReconciliationPageSummary[];
  items: ReconciliationReportItem[];
}

function sourceKey(
  input: Pick<RegisterNativeInputInput, "sourceType" | "sourceId">,
): string {
  return `${input.sourceType}:${input.sourceId}`;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addCandidate(
  candidates: Map<string, Candidate>,
  producer: Producer,
  input: RegisterNativeInputInput,
): void {
  const key = sourceKey(input);
  if (!candidates.has(key)) candidates.set(key, { producer, input });
}

function cursorFromRow(row: ReconciliationRow): PageCursor {
  if (!row.id || !row.created) {
    throw new Error("Paginated reconciliation rows require created and id");
  }
  return { created: new Date(row.created), id: String(row.id) };
}

function whereAfterCursor(
  where: Record<string | symbol, unknown>,
  cursor: PageCursor | null,
): Record<string | symbol, unknown> {
  if (!cursor) return where;

  return {
    [Op.and]: [
      where,
      {
        [Op.or]: [
          { created: { [Op.gt]: cursor.created } },
          {
            [Op.and]: [
              { created: cursor.created },
              { id: { [Op.gt]: cursor.id } },
            ],
          },
        ],
      },
    ],
  };
}

async function readPage(
  stream: StreamName,
  model: { findAll: (options: Record<string, unknown>) => Promise<unknown[]> },
  where: Record<string | symbol, unknown>,
  state: StreamState,
  pageSize: number,
  extra: Record<string, unknown> = {},
): Promise<StreamPage> {
  if (state.done) {
    return { stream, rows: [], nextCursor: null, hasMore: false };
  }

  const rows = (await model.findAll({
    ...extra,
    where: whereAfterCursor(where, state.cursor),
    order: [
      ["created", "ASC"],
      ["id", "ASC"],
    ],
    limit: pageSize + 1,
  })) as ReconciliationRow[];
  const pageRows = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  const nextCursor = hasMore
    ? cursorFromRow(pageRows[pageRows.length - 1])
    : null;

  return { stream, rows: pageRows, nextCursor, hasMore };
}

function classifyBuildError(error: unknown): CollectionItem["outcome"] {
  const message = asErrorMessage(error).toLowerCase();
  if (message.includes("no longer exists")) return "dangling";
  if (
    message.includes("requires a scope") ||
    message.includes("only successful") ||
    message.includes("only persisted")
  ) {
    return "ambiguous";
  }
  return "failed";
}

async function collectGHGIPage(
  pageSize: number,
  states: Record<StreamName, StreamState>,
): Promise<PageCollection> {
  const candidates = new Map<string, Candidate>();
  const items: CollectionItem[] = [];
  const streams = await Promise.all([
    readPage(
      "ghgiImportedFiles",
      db.models.ImportedInventoryFile,
      {},
      states.ghgiImportedFiles,
      pageSize,
    ),
    readPage(
      "ghgiCompletedImports",
      db.models.ImportedInventoryFile,
      { importStatus: "completed" },
      states.ghgiCompletedImports,
      pageSize,
    ),
    readPage(
      "ghgiOcrJobs",
      db.models.PdfOcrJob,
      {
        sourceType: "inventory_import",
        status: "succeeded",
        resultS3Key: { [Op.ne]: null },
        resultSha256: { [Op.ne]: null },
        pageCount: { [Op.ne]: null },
      },
      states.ghgiOcrJobs,
      pageSize,
    ),
  ]);

  const importedFiles = streams[0].rows as unknown as ImportedInventoryFile[];
  const completedImports = streams[1]
    .rows as unknown as ImportedInventoryFile[];
  const ocrJobs = streams[2].rows as unknown as PdfOcrJob[];

  for (const importedFile of importedFiles) {
    if (importedFile.importStatus === ImportStatusEnum.FAILED) {
      items.push({
        producer: "ghgi",
        outcome: "skipped",
        sourceType: "imported_inventory_file",
        sourceId: importedFile.id,
        reason: "Failed GHGI imports are not eligible for catalog repair",
      });
      continue;
    }

    try {
      addCandidate(
        candidates,
        "ghgi",
        buildGHGIImportedInventorySourceInput(
          importedFile,
          importedFile.contentDigest ?? null,
        ),
      );
    } catch (error) {
      items.push({
        producer: "ghgi",
        outcome: classifyBuildError(error),
        sourceType: "imported_inventory_file",
        sourceId: importedFile.id,
        reason: asErrorMessage(error),
      });
    }
  }

  for (const importedFile of completedImports) {
    try {
      addCandidate(candidates, "ghgi", buildGHGIInventoryInput(importedFile));
    } catch (error) {
      items.push({
        producer: "ghgi",
        outcome: classifyBuildError(error),
        sourceType: "inventory",
        sourceId: importedFile.inventoryId,
        reason: asErrorMessage(error),
      });
    }
  }

  for (const job of ocrJobs) {
    try {
      addCandidate(candidates, "ghgi", await buildGHGIOcrArtifactInput(job));
    } catch (error) {
      items.push({
        producer: "ghgi",
        outcome: classifyBuildError(error),
        sourceType: "pdf_ocr_job",
        sourceId: job.id,
        reason: asErrorMessage(error),
      });
    }
  }

  return {
    candidates: [...candidates.values()],
    items,
    catalogEntries: [],
    withdrawnCatalogEntries: [],
    streams,
    recordsScanned: streams.reduce(
      (sum, stream) => sum + stream.rows.length,
      0,
    ),
  };
}

async function collectHIAPPage(
  pageSize: number,
  states: Record<StreamName, StreamState>,
): Promise<PageCollection> {
  const candidates = new Map<string, Candidate>();
  const items: CollectionItem[] = [];
  const streams = await Promise.all([
    readPage(
      "hiapRankings",
      db.models.HighImpactActionRanking,
      { status: HighImpactActionRankingStatus.SUCCESS },
      states.hiapRankings,
      pageSize,
    ),
    readPage(
      "hiapRankedSelections",
      db.models.HighImpactActionRanked,
      { isSelected: true },
      states.hiapRankedSelections,
      pageSize,
      {
        include: [
          {
            model: db.models.HighImpactActionRanking,
            as: "highImpactActionRanking",
            required: true,
            where: { status: HighImpactActionRankingStatus.SUCCESS },
            attributes: ["id", "inventoryId", "userId"],
          },
        ],
      },
    ),
    readPage(
      "hiapActionPlans",
      db.models.ActionPlan,
      {
        inventoryId: { [Op.ne]: null },
        highImpactActionRankedId: { [Op.ne]: null },
      },
      states.hiapActionPlans,
      pageSize,
    ),
    readPage(
      "hiapUnrankedSelections",
      db.models.UnrankedActionSelection,
      { isSelected: true },
      states.hiapUnrankedSelections,
      pageSize,
    ),
  ]);

  const rankings = streams[0].rows as unknown as HighImpactActionRanking[];
  const rankedSelections = streams[1].rows as unknown as Array<
    HighImpactActionRanked & {
      highImpactActionRanking?: HighImpactActionRanking;
    }
  >;
  const actionPlans = streams[2].rows as unknown as ActionPlan[];
  const unrankedSelections = streams[3]
    .rows as unknown as UnrankedActionSelection[];

  for (const ranking of rankings) {
    try {
      addCandidate(candidates, "hiap", await buildHIAPRankingInput(ranking));
    } catch (error) {
      items.push({
        producer: "hiap",
        outcome: classifyBuildError(error),
        sourceType: "hiap_ranking",
        sourceId: ranking.id,
        reason: asErrorMessage(error),
      });
    }
  }

  for (const selection of rankedSelections) {
    try {
      const ranking = selection.highImpactActionRanking;
      if (!ranking) throw new Error("Selected HIAP action has no ranking");
      const scope = await resolveHIAPCatalogScope({
        inventoryId: ranking.inventoryId,
        userId: ranking.userId,
      });
      addCandidate(
        candidates,
        "hiap",
        buildHIAPSelectionInput(
          "hiap_ranked_selection",
          ranking.inventoryId,
          selection.type as ACTION_TYPES,
          selection.actionId,
          scope,
          ranking.id,
        ),
      );
    } catch (error) {
      items.push({
        producer: "hiap",
        outcome: classifyBuildError(error),
        sourceType: "hiap_ranked_selection",
        sourceId: selection.id,
        reason: asErrorMessage(error),
      });
    }
  }

  for (const actionPlan of actionPlans) {
    try {
      addCandidate(
        candidates,
        "hiap",
        await buildHIAPActionPlanInput(actionPlan),
      );
    } catch (error) {
      items.push({
        producer: "hiap",
        outcome: classifyBuildError(error),
        sourceType: "action_plan",
        sourceId: actionPlan.id,
        reason: asErrorMessage(error),
      });
    }
  }

  for (const selection of unrankedSelections) {
    try {
      const scope = await resolveHIAPCatalogScope({
        inventoryId: selection.inventoryId,
      });
      addCandidate(
        candidates,
        "hiap",
        buildHIAPSelectionInput(
          "hiap_unranked_selection",
          selection.inventoryId,
          selection.actionType as ACTION_TYPES,
          selection.actionId,
          scope,
        ),
      );
    } catch (error) {
      items.push({
        producer: "hiap",
        outcome: classifyBuildError(error),
        sourceType: "hiap_unranked_selection",
        sourceId: selection.id,
        reason: asErrorMessage(error),
      });
    }
  }

  return {
    candidates: [...candidates.values()],
    items,
    catalogEntries: [],
    withdrawnCatalogEntries: [],
    streams,
    recordsScanned: streams.reduce(
      (sum, stream) => sum + stream.rows.length,
      0,
    ),
  };
}

async function collectCatalogPage(
  pageSize: number,
  states: Record<StreamName, StreamState>,
): Promise<PageCollection> {
  const stream = await readPage(
    "catalog",
    db.models.NativeInputCatalog,
    {
      owningModule: { [Op.in]: PRODUCERS },
      availability: { [Op.in]: ["active", "withdrawn"] },
    },
    states.catalog,
    pageSize,
  );
  const catalogEntries = stream.rows.filter(
    (row) => row.availability === "active",
  ) as unknown as NativeInputCatalog[];
  const withdrawnCatalogEntries = stream.rows.filter(
    (row) => row.availability === "withdrawn",
  ) as unknown as NativeInputCatalog[];

  return {
    candidates: [],
    items: [],
    catalogEntries,
    withdrawnCatalogEntries,
    streams: [stream],
    recordsScanned: stream.rows.length,
  };
}

function initialStreamStates(): Record<StreamName, StreamState> {
  return Object.fromEntries(
    STREAM_NAMES.map((stream) => [stream, { cursor: null, done: false }]),
  ) as Record<StreamName, StreamState>;
}

function scopeMatches(
  input: RegisterNativeInputInput,
  catalog: NativeInputCatalog,
): boolean {
  return SCOPE_FIELDS.every((field: ScopeField) => {
    const expected = input[field] ?? null;
    const actual = catalog[field] ?? null;
    return expected == null || expected === actual;
  });
}

function createCounts(): Record<ReconciliationOutcome, number> {
  return Object.fromEntries(
    RECONCILIATION_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<ReconciliationOutcome, number>;
}

function addItems(
  target: ReconciliationReportItem[],
  source: CollectionItem[],
): void {
  target.push(
    ...source.map((item) => ({
      producer: item.producer,
      outcome: item.outcome,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      reason: item.reason,
    })),
  );
}

export async function reconcileNativeInputCatalog({
  mode,
  limit = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
}: {
  mode: ReconciliationMode;
  limit?: number;
  maxPages?: number;
}): Promise<NativeInputCatalogReconciliationReport> {
  const pageSize = Math.min(
    Math.max(Math.floor(limit), 1),
    MAX_RECONCILIATION_PAGE_SIZE,
  );
  const pageLimit = Math.min(
    Math.max(Math.floor(maxPages), 1),
    MAX_RECONCILIATION_PAGES,
  );
  const runId = randomUUID();
  const startedAt = new Date();
  const states = initialStreamStates();
  const candidates = new Map<string, Candidate>();
  const activeByKey = new Map<string, NativeInputCatalog[]>();
  const withdrawnByKey = new Map<string, NativeInputCatalog[]>();
  const items: ReconciliationReportItem[] = [];
  const pageSummaries: ReconciliationPageSummary[] = [];
  let pagesProcessed = 0;
  let recordsScanned = 0;
  let complete = false;

  while (pagesProcessed < pageLimit) {
    pagesProcessed++;
    try {
      const [ghgiPage, hiapPage, catalogPage] = await Promise.all([
        collectGHGIPage(pageSize, states),
        collectHIAPPage(pageSize, states),
        collectCatalogPage(pageSize, states),
      ]);
      const page = [ghgiPage, hiapPage, catalogPage];
      const streams = page.flatMap((result) => result.streams);
      recordsScanned += page.reduce(
        (sum, result) => sum + result.recordsScanned,
        0,
      );
      addItems(
        items,
        page.flatMap((result) => result.items),
      );
      for (const result of page) {
        for (const candidate of result.candidates) {
          candidates.set(sourceKey(candidate.input), candidate);
        }
        for (const entry of result.catalogEntries) {
          const key = sourceKey(entry);
          const entries = activeByKey.get(key) ?? [];
          entries.push(entry);
          activeByKey.set(key, entries);
        }
        for (const entry of result.withdrawnCatalogEntries) {
          const key = sourceKey(entry);
          const entries = withdrawnByKey.get(key) ?? [];
          entries.push(entry);
          withdrawnByKey.set(key, entries);
        }
      }

      for (const stream of streams) {
        states[stream.stream].cursor = stream.nextCursor;
        states[stream.stream].done = !stream.hasMore;
      }

      pageSummaries.push({
        pageNumber: pagesProcessed,
        recordsScanned: page.reduce(
          (sum, result) => sum + result.recordsScanned,
          0,
        ),
        streams: streams.map((stream) => ({
          stream: stream.stream,
          recordsFetched: stream.rows.length,
          hasMore: stream.hasMore,
        })),
      });

      if (STREAM_NAMES.every((stream) => states[stream].done)) {
        complete = true;
        break;
      }
    } catch (error) {
      items.push({
        producer: "system",
        outcome: "failed",
        reason: `Page ${pagesProcessed} failed: ${asErrorMessage(error)}`,
      });
      break;
    }
  }

  const sourceStreams: StreamName[] = [
    "ghgiImportedFiles",
    "ghgiCompletedImports",
    "ghgiOcrJobs",
    "hiapRankings",
    "hiapRankedSelections",
    "hiapActionPlans",
    "hiapUnrankedSelections",
  ];
  const sourceScanComplete = sourceStreams.every(
    (stream) => states[stream].done,
  );
  const catalogScanComplete = states.catalog.done;

  for (const candidate of candidates.values()) {
    const key = sourceKey(candidate.input);
    const matchingEntries = activeByKey.get(key) ?? [];
    const withdrawnEntries = withdrawnByKey.get(key) ?? [];
    let outcome: ReconciliationOutcome = "matched";
    let reason: string | undefined;

    if (matchingEntries.length === 0 && withdrawnEntries.length > 0) {
      outcome = "skipped";
      reason =
        "Catalog registration was withdrawn; reconciliation will not recreate it";
    } else if (matchingEntries.length === 0 && !catalogScanComplete) {
      outcome = "ambiguous";
      reason = "Catalog scan is incomplete; registration cannot be classified";
    } else if (matchingEntries.length === 0) {
      outcome = "missing";
      reason = "Producer source exists without an active catalog registration";
    } else if (matchingEntries.length > 1) {
      outcome = "duplicate";
      reason = "Multiple active catalog entries share the same source identity";
    } else if (!scopeMatches(candidate.input, matchingEntries[0])) {
      outcome = "scope-inconsistent";
      reason = "Producer scope does not match the active catalog registration";
    }

    items.push({
      producer: candidate.producer,
      outcome,
      sourceType: candidate.input.sourceType,
      sourceId: candidate.input.sourceId,
      catalogIds: (matchingEntries.length > 0
        ? matchingEntries
        : withdrawnEntries
      ).map((entry) => entry.id),
      reason,
    });
  }

  if (sourceScanComplete && catalogScanComplete) {
    for (const [key, entries] of activeByKey) {
      if (candidates.has(key)) continue;
      const entry = entries[0];
      items.push({
        producer: entry.owningModule === "ghgi" ? "ghgi" : "hiap",
        outcome: "dangling",
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        catalogIds: entries.map((catalog) => catalog.id),
        reason: "Active catalog registration has no matching producer source",
      });
    }
  }

  if (mode === "apply" && complete) {
    for (const item of items) {
      if (item.outcome !== "missing" || !item.sourceType || !item.sourceId) {
        continue;
      }

      const candidate = candidates.get(`${item.sourceType}:${item.sourceId}`);
      if (!candidate) continue;

      try {
        const registration = await registerNativeInput(candidate.input);
        item.outcome = registration.created ? "repaired" : "matched";
        item.catalogId = registration.catalog.id;
        item.reason = registration.created
          ? "Created the missing catalog registration"
          : "Registration appeared before the repair was applied";
      } catch (error) {
        item.outcome = "failed";
        item.reason = `Repair failed: ${asErrorMessage(error)}`;
      }
    }
  }

  const completedAt = new Date();
  const counts = createCounts();
  for (const item of items) counts[item.outcome]++;
  const truncated = !complete;
  const report = {
    runId,
    mode,
    pageSize,
    maxPages: pageLimit,
    pagesProcessed,
    recordsScanned,
    complete,
    truncated,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    counts,
    pageSummaries,
    items,
  } satisfies NativeInputCatalogReconciliationReport;

  logger.info(
    {
      runId,
      mode,
      complete,
      truncated,
      pagesProcessed,
      recordsScanned,
      durationMs: report.durationMs,
      counts,
    },
    "Native input catalog reconciliation completed",
  );
  return report;
}
