import DataSourceService from "@/backend/DataSourceService";
import { db } from "@/models";
import type { DataSourceI18n } from "@/models/DataSourceI18n";
import type { Inventory } from "@/models/Inventory";
import { logger } from "@/services/logger";
import { randomUUID } from "crypto";

const STATIONARY_ENERGY_SECTOR_CODE = "I";
const STATIONARY_ENERGY_SECTOR_NAME = "Stationary Energy";
const DEFAULT_CONFLICT_VARIANCE_THRESHOLD = 0.15;

type DraftLocale = "en" | "es" | "pt";
type GeographyMatch =
  | "city_direct"
  | "city_proxy"
  | "regional_proxy"
  | "country_proxy";
type CoverageLevel = "complete" | "partial" | "missing";
type DraftProposalStatus = "ready" | "conflict" | "gap";
type DraftReviewAction = "accept" | "override" | "leave_draft";

export type DraftSourceCandidate = {
  source_id?: string;
  source_name: string;
  value?: number | null;
  unit?: string | null;
  year?: number | null;
  tier?: number | null;
  method?: string | null;
  geography_match: GeographyMatch;
  coverage: CoverageLevel;
  confidence?: number | null;
  citation?: string | null;
  rationale_notes: string[];
};

export type DraftRecommendation = {
  source_id?: string;
  value: number;
  unit: string;
  source_name: string;
  source_year?: number | null;
  source_tier?: number | null;
  method?: string | null;
  confidence?: number | null;
  citation?: string | null;
};

export type SubsectorDraftProposal = {
  proposal_id: string;
  subsector_code: string;
  status: DraftProposalStatus;
  recommended?: DraftRecommendation | null;
  alternatives: DraftSourceCandidate[];
  rationale: string;
  ui_message: string;
  needs_user_choice: boolean;
};

export type SectorDraftOutput = {
  run_id: string;
  inventory_id: string;
  city_id: string;
  city_name: string;
  locode: string;
  sector_code: string;
  locale: DraftLocale;
  proposals: SubsectorDraftProposal[];
};

export type SectorDraftRequestPayload = {
  inventory: {
    inventory_id: string;
    city_id: string;
    city_name: string;
    locode: string;
    country_code?: string | null;
    year: number;
    locale: DraftLocale;
  };
  sector: {
    code: string;
    name: string;
    subsectors: { code: string; label: string }[];
  };
  current_state: {
    subsector_code: string;
    existing_value?: number | null;
    existing_unit?: string | null;
    notation_key?: string | null;
    is_locked: boolean;
    source_name?: string | null;
  }[];
  candidates: {
    subsector_code: string;
    options: DraftSourceCandidate[];
  }[];
  policy: {
    allowed_sources: string[];
    conflict_variance_threshold: number;
    require_explicit_acceptance: boolean;
  };
};

export type DraftRunResponse = {
  draft: SectorDraftOutput;
  request: SectorDraftRequestPayload;
  callChain: {
    owner: string;
    path: string;
    data: string[];
  }[];
  usedClimateAdvisor: boolean;
};

export type DraftReviewDecision = {
  proposalId: string;
  subsectorCode: string;
  action: DraftReviewAction;
  selectedSourceId?: string;
  selectedSourceName?: string;
  overrideValue?: number;
  overrideUnit?: string;
  note?: string;
};

type StoredProposal = {
  proposalId: string;
  recommended?: DraftRecommendation | null;
  alternatives?: DraftSourceCandidate[] | null;
};

function normalizeLocale(locale?: string | null): DraftLocale {
  if (locale === "es" || locale === "pt") {
    return locale;
  }
  return "en";
}

function getSourceName(source: DataSourceI18n): string {
  return (
    source.datasourceName ||
    source.datasetName?.en ||
    source.datasetName?.pt ||
    source.datasetName?.es ||
    source.datasourceId
  );
}

function getReferenceNumber(source: DataSourceI18n): string | undefined {
  return (
    source.subCategory?.referenceNumber ||
    source.subSector?.referenceNumber ||
    source.subCategory?.subsector?.referenceNumber
  );
}

function getSubsectorCode(source: DataSourceI18n): string | undefined {
  const ref = getReferenceNumber(source);
  if (!ref) {
    return undefined;
  }
  const parts = ref.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return ref;
}

function isStationaryEnergySource(source: DataSourceI18n): boolean {
  const ref = getReferenceNumber(source);
  return !!ref && ref.startsWith(`${STATIONARY_ENERGY_SECTOR_CODE}.`);
}

function geographyMatch(
  source: DataSourceI18n,
  inventory: Inventory,
): GeographyMatch {
  const city = inventory.city;
  const locations = source.geographicalLocation?.split(",") ?? [];
  const locode = city?.locode;
  const region = city?.region || city?.regionLocode;
  const country = city?.countryLocode || locode?.split(" ")[0];

  if (locode && locations.includes(locode)) {
    return "city_direct";
  }
  if (source.retrievalMethod?.includes("downscaled")) {
    return "city_proxy";
  }
  if (region && locations.includes(region)) {
    return "regional_proxy";
  }
  if (country && locations.includes(country)) {
    return "country_proxy";
  }
  return "country_proxy";
}

function inferCoverage(data: any): CoverageLevel {
  if (!data?.totals?.emissions?.co2eq_100yr) {
    return "missing";
  }
  if (Array.isArray(data.records) && data.records.length > 0) {
    return "complete";
  }
  return "partial";
}

function inferTier(source: DataSourceI18n, data: any): number | null {
  const quality = [
    source.dataQuality,
    source.notes,
    data?.totals?.emissions?.gpc_quality,
  ]
    .filter(Boolean)
    .join(" ");
  const match = quality.match(/tier\s*([1-3])/i);
  if (match) {
    return Number(match[1]);
  }
  if (/high/i.test(quality)) {
    return 2;
  }
  if (/low/i.test(quality)) {
    return 3;
  }
  return null;
}

function parseNumeric(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceForSource(
  source: DataSourceI18n,
  inventory: Inventory,
  coverage: CoverageLevel,
): number {
  const geography = geographyMatch(source, inventory);
  const geoScore =
    geography === "city_direct"
      ? 0.35
      : geography === "city_proxy"
        ? 0.28
        : geography === "regional_proxy"
          ? 0.2
          : 0.12;
  const coverageScore =
    coverage === "complete" ? 0.3 : coverage === "partial" ? 0.18 : 0;
  const priorityScore = Math.min((source.priority ?? 5) / 10, 1) * 0.2;
  const yearScore =
    source.latestAccountingYear && inventory.year
      ? Math.max(
          0,
          0.15 - Math.abs(inventory.year - source.latestAccountingYear) * 0.03,
        )
      : 0.08;

  return Math.min(
    1,
    Number((geoScore + coverageScore + priorityScore + yearScore).toFixed(2)),
  );
}

function toDraftCandidate(
  source: DataSourceI18n,
  data: any,
  inventory: Inventory,
): DraftSourceCandidate | null {
  const subsectorCode = getSubsectorCode(source);
  if (!subsectorCode) {
    return null;
  }

  const rawValue = parseNumeric(data?.totals?.emissions?.co2eq_100yr);
  const scaleFactor = parseNumeric(data?.scaleFactor) ?? 1;
  const coverage = inferCoverage(data);
  const value = rawValue == null ? null : rawValue * scaleFactor;

  return {
    source_id: source.datasourceId,
    source_name: getSourceName(source),
    value,
    unit: source.units || "kgCO2e",
    year: source.latestAccountingYear || inventory.year || null,
    tier: inferTier(source, data),
    method: source.retrievalMethod || null,
    geography_match: geographyMatch(source, inventory),
    coverage,
    confidence: confidenceForSource(source, inventory, coverage),
    citation: source.methodologyUrl || source.url || null,
    rationale_notes: [
      source.retrievalMethod
        ? `Retrieved through ${source.retrievalMethod}.`
        : "Retrieved from an approved CityCatalyst data source.",
      data?.issue ? `Population scaling issue: ${data.issue}.` : "",
    ].filter(Boolean),
  };
}

function groupCandidates(
  candidates: { subsectorCode: string; option: DraftSourceCandidate }[],
) {
  const grouped = new Map<string, DraftSourceCandidate[]>();
  for (const candidate of candidates) {
    const options = grouped.get(candidate.subsectorCode) ?? [];
    options.push(candidate.option);
    grouped.set(candidate.subsectorCode, options);
  }
  return Array.from(grouped.entries()).map(([subsector_code, options]) => ({
    subsector_code,
    options,
  }));
}

function candidateScore(candidate: DraftSourceCandidate, targetYear: number) {
  const geoScore = {
    city_direct: 4,
    city_proxy: 3,
    regional_proxy: 2,
    country_proxy: 1,
  }[candidate.geography_match];
  const coverageScore = {
    complete: 2,
    partial: 1,
    missing: -2,
  }[candidate.coverage];
  const yearPenalty = candidate.year
    ? Math.min(Math.abs(targetYear - candidate.year), 10) * 0.05
    : 0;
  const tierBonus = candidate.tier ? (4 - candidate.tier) * 0.25 : 0;
  return (
    geoScore +
    coverageScore +
    (candidate.confidence ?? 0) +
    tierBonus -
    yearPenalty
  );
}

function localDraftOutput(
  request: SectorDraftRequestPayload,
): SectorDraftOutput {
  const runId = randomUUID();
  const candidateSets = new Map(
    request.candidates.map((candidateSet) => [
      candidateSet.subsector_code,
      candidateSet.options,
    ]),
  );
  const currentState = new Map(
    request.current_state.map((state) => [state.subsector_code, state]),
  );

  return {
    run_id: runId,
    inventory_id: request.inventory.inventory_id,
    city_id: request.inventory.city_id,
    city_name: request.inventory.city_name,
    locode: request.inventory.locode,
    sector_code: request.sector.code,
    locale: request.inventory.locale,
    proposals: request.sector.subsectors.map((subsector) => {
      if (currentState.get(subsector.code)?.is_locked) {
        return {
          proposal_id: randomUUID(),
          subsector_code: subsector.code,
          status: "gap",
          recommended: null,
          alternatives: [],
          rationale:
            "The row already has a locked value, so no draft was proposed.",
          ui_message: `${subsector.code} is already locked for ${request.inventory.city_name}.`,
          needs_user_choice: false,
        };
      }

      const options = (candidateSets.get(subsector.code) ?? [])
        .filter((candidate) => candidate.value != null && candidate.unit)
        .sort(
          (a, b) =>
            candidateScore(b, request.inventory.year) -
            candidateScore(a, request.inventory.year),
        );

      if (options.length === 0) {
        return {
          proposal_id: randomUUID(),
          subsector_code: subsector.code,
          status: "gap",
          recommended: null,
          alternatives: [],
          rationale:
            "No approved source candidate with usable data was supplied for this city inventory.",
          ui_message: `${subsector.code} has no third-party data for ${request.inventory.city_name}, ${request.inventory.year}.`,
          needs_user_choice: false,
        };
      }

      const best = options[0];
      const second = options[1];
      const variance =
        second && best.value
          ? Math.abs((best.value ?? 0) - (second.value ?? 0)) /
            Math.max(Math.abs(best.value), 1)
          : 0;
      const status: DraftProposalStatus =
        second && variance >= request.policy.conflict_variance_threshold
          ? "conflict"
          : "ready";

      return {
        proposal_id: randomUUID(),
        subsector_code: subsector.code,
        status,
        recommended: {
          source_id: best.source_id,
          value: best.value ?? 0,
          unit: best.unit ?? "unknown",
          source_name: best.source_name,
          source_year: best.year,
          source_tier: best.tier,
          method: best.method,
          confidence: best.confidence,
          citation: best.citation,
        },
        alternatives: options.slice(1),
        rationale: `${best.source_name} is the strongest supplied candidate for ${request.inventory.city_name}, ${request.inventory.year}: ${best.geography_match}, ${best.coverage} coverage.`,
        ui_message: `I drafted ${subsector.code} from ${best.source_name}. Review the source before saving.`,
        needs_user_choice: status === "conflict",
      };
    }),
  };
}

async function callClimateAdvisor(
  request: SectorDraftRequestPayload,
): Promise<{ output: SectorDraftOutput; usedClimateAdvisor: boolean }> {
  const baseUrl =
    process.env.CLIMATE_ADVISOR_URL ||
    process.env.CA_BASE_URL ||
    process.env.NEXT_PUBLIC_CLIMATE_ADVISOR_URL;

  if (!baseUrl) {
    return { output: localDraftOutput(request), usedClimateAdvisor: false };
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/inventory-drafts/stationary-energy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Climate Advisor draft route failed with ${response.status}: ${body}`,
    );
  }

  return {
    output: (await response.json()) as SectorDraftOutput,
    usedClimateAdvisor: true,
  };
}

export default class AgenticInventoryDraftService {
  static async buildStationaryEnergyDraftRun({
    inventory,
    locale,
  }: {
    inventory: Inventory;
    locale?: string | null;
  }): Promise<DraftRunResponse> {
    if (!inventory.cityId || !inventory.city) {
      throw new Error("Inventory must include city data for draft generation");
    }

    const models = db.models as any;

    const sector = await models.Sector.findOne({
      where: { referenceNumber: STATIONARY_ENERGY_SECTOR_CODE },
      include: [{ model: models.SubSector, as: "subSectors" }],
    });

    const subsectors = (sector?.subSectors ?? [])
      .filter((subsector: any) => subsector.referenceNumber?.startsWith("I."))
      .sort((a: any, b: any) =>
        (a.referenceNumber || "").localeCompare(b.referenceNumber || ""),
      )
      .map((subsector: any) => ({
        code: subsector.referenceNumber!,
        label: subsector.subsectorName || subsector.referenceNumber!,
      }));

    const allExistingValues = await models.InventoryValue.findAll({
      where: {
        inventoryId: inventory.inventoryId,
      },
      include: [{ model: models.DataSource, as: "dataSource" }],
    });
    const existingValues = allExistingValues.filter((value: any) =>
      value.gpcReferenceNumber?.startsWith(STATIONARY_ENERGY_SECTOR_CODE),
    );

    const existingStateBySubsector = new Map(
      existingValues.map((value: any) => [
        value.gpcReferenceNumber?.split(".").slice(0, 2).join("."),
        value,
      ]),
    );

    const sources = await DataSourceService.findAllSources(
      inventory.inventoryId,
    );
    const { applicableSources } = DataSourceService.filterSources(
      inventory,
      sources.filter(isStationaryEnergySource),
    );
    const populationScaleFactors =
      await DataSourceService.findPopulationScaleFactors(
        inventory,
        applicableSources,
      );

    const sourceData = await Promise.all(
      applicableSources.map((source) =>
        DataSourceService.getSourceWithData(
          source,
          inventory,
          populationScaleFactors.countryPopulationScaleFactor,
          populationScaleFactors.regionPopulationScaleFactor,
          populationScaleFactors.populationIssue,
        ),
      ),
    );

    const candidates = sourceData
      .filter((entry) => !entry.error && entry.data)
      .map((entry) => {
        const option = toDraftCandidate(entry.source, entry.data, inventory);
        const subsectorCode = getSubsectorCode(entry.source);
        if (!option || !subsectorCode) {
          return null;
        }
        return { subsectorCode, option };
      })
      .filter(Boolean) as {
      subsectorCode: string;
      option: DraftSourceCandidate;
    }[];

    const request: SectorDraftRequestPayload = {
      inventory: {
        inventory_id: inventory.inventoryId,
        city_id: inventory.cityId,
        city_name: inventory.city.name || "Unknown city",
        locode: inventory.city.locode || "",
        country_code:
          inventory.city.countryLocode ||
          inventory.city.locode?.split(" ")[0] ||
          null,
        year: inventory.year!,
        locale: normalizeLocale(locale),
      },
      sector: {
        code: STATIONARY_ENERGY_SECTOR_CODE,
        name: sector?.sectorName || STATIONARY_ENERGY_SECTOR_NAME,
        subsectors,
      },
      current_state: subsectors.map((subsector: { code: string }) => {
        const existing = existingStateBySubsector.get(subsector.code) as any;
        return {
          subsector_code: subsector.code,
          existing_value: existing?.co2eq ? Number(existing.co2eq) : null,
          existing_unit: existing?.co2eq ? "kgCO2e" : null,
          notation_key: existing?.unavailableReason || null,
          is_locked: !!existing,
          source_name: existing?.dataSource
            ? getSourceName(existing.dataSource)
            : null,
        };
      }),
      candidates: groupCandidates(candidates),
      policy: {
        allowed_sources: Array.from(
          new Set(candidates.map((candidate) => candidate.option.source_name)),
        ),
        conflict_variance_threshold: DEFAULT_CONFLICT_VARIANCE_THRESHOLD,
        require_explicit_acceptance: true,
      },
    };

    const { output, usedClimateAdvisor } = await callClimateAdvisor(request);
    await this.persistDraftOutput(output);

    return {
      draft: output,
      request,
      usedClimateAdvisor,
      callChain: [
        {
          owner: "CityCatalyst UI",
          path: "/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy",
          data: ["cityId", "inventoryId", "locale"],
        },
        {
          owner: "CityCatalyst API",
          path: "POST /api/v1/inventory/{inventoryId}/draft/stationary-energy",
          data: [
            "inventory_id",
            "city_id",
            "city_name",
            "locode",
            "country_code",
            "year",
            "current_state",
            "source_candidates",
          ],
        },
        {
          owner: "Global API through DataSourceService",
          path: "source.apiEndpoint with :actor_id/:locode/:country/:year/:gpc_reference_number",
          data: ["locode", "country_code", "year", "gpc_reference_number"],
        },
        {
          owner: "Climate Advisor",
          path: "POST /v1/inventory-drafts/stationary-energy",
          data: [
            "city-scoped inventory block",
            "Stationary Energy subsectors",
            "normalized candidates",
            "ranking policy",
          ],
        },
      ],
    };
  }

  static async applyReviewDecisions({
    inventory,
    decisions,
    userId,
  }: {
    inventory: Inventory;
    decisions: DraftReviewDecision[];
    userId?: string;
  }) {
    const applied: {
      proposalId: string;
      dataSourceId: string;
      inventoryValueId?: string;
    }[] = [];
    const staged: { proposalId: string; action: DraftReviewAction }[] = [];
    const failed: { proposalId: string; issue: string }[] = [];

    const proposals = await this.findStoredProposals(
      inventory.inventoryId,
      decisions.map((decision) => decision.proposalId),
    );

    for (const decision of decisions) {
      try {
        const proposal = proposals.get(decision.proposalId);
        if (!proposal) {
          failed.push({
            proposalId: decision.proposalId,
            issue: "Draft proposal was not found in staging",
          });
          continue;
        }

        if (decision.action === "leave_draft") {
          await this.updateStoredDecision({
            inventoryId: inventory.inventoryId,
            decision,
            status: "draft",
            userId,
          });
          staged.push({
            proposalId: decision.proposalId,
            action: decision.action,
          });
          continue;
        }

        const sourceId = this.resolveDecisionSourceId(proposal, decision);
        if (!sourceId) {
          await this.updateStoredDecision({
            inventoryId: inventory.inventoryId,
            decision,
            status: "manual_override_staged",
            userId,
          });
          staged.push({
            proposalId: decision.proposalId,
            action: decision.action,
          });
          continue;
        }

        const source = await DataSourceService.findSource(
          inventory.inventoryId,
          sourceId,
        );
        if (!source) {
          failed.push({
            proposalId: decision.proposalId,
            issue: `Data source ${sourceId} was not found`,
          });
          continue;
        }

        const { applicableSources } = DataSourceService.filterSources(
          inventory,
          [source],
        );
        if (applicableSources.length === 0) {
          failed.push({
            proposalId: decision.proposalId,
            issue: `Data source ${sourceId} is not applicable to this city inventory`,
          });
          continue;
        }

        const populationScaleFactors =
          await DataSourceService.findPopulationScaleFactors(inventory, [
            source,
          ]);
        const result = await DataSourceService.applySource(
          source,
          inventory,
          populationScaleFactors,
          userId,
          true,
        );

        if (!result.success) {
          failed.push({
            proposalId: decision.proposalId,
            issue: result.issue || "Applying the data source failed",
          });
          continue;
        }

        const models = db.models as any;
        const inventoryValue = await models.InventoryValue.findOne({
          where: {
            inventoryId: inventory.inventoryId,
            datasourceId: source.datasourceId,
          },
          order: [["last_updated", "DESC"]],
        });

        await this.updateStoredDecision({
          inventoryId: inventory.inventoryId,
          decision,
          status: "accepted",
          selectedSourceId: source.datasourceId,
          selectedSourceName: getSourceName(source),
          appliedInventoryValueId: inventoryValue?.id,
          userId,
        });

        applied.push({
          proposalId: decision.proposalId,
          dataSourceId: source.datasourceId,
          inventoryValueId: inventoryValue?.id,
        });
      } catch (error) {
        logger.error({ error }, "Failed to apply inventory draft decision");
        failed.push({
          proposalId: decision.proposalId,
          issue: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { applied, staged, failed };
  }

  private static async persistDraftOutput(output: SectorDraftOutput) {
    if (!db.sequelize) {
      return;
    }

    try {
      await Promise.all(
        output.proposals.map((proposal) =>
          db.sequelize!.query(
            `
            INSERT INTO "ProposedInventoryChange" (
              proposal_id,
              run_id,
              inventory_id,
              city_id,
              sector_code,
              subsector_code,
              status,
              recommended,
              alternatives,
              rationale,
              ui_message,
              needs_user_choice,
              created,
              last_updated
            )
            VALUES (
              :proposalId,
              :runId,
              :inventoryId,
              :cityId,
              :sectorCode,
              :subsectorCode,
              :status,
              CAST(:recommended AS jsonb),
              CAST(:alternatives AS jsonb),
              :rationale,
              :uiMessage,
              :needsUserChoice,
              NOW(),
              NOW()
            )
            ON CONFLICT (proposal_id) DO UPDATE SET
              run_id = EXCLUDED.run_id,
              status = EXCLUDED.status,
              recommended = EXCLUDED.recommended,
              alternatives = EXCLUDED.alternatives,
              rationale = EXCLUDED.rationale,
              ui_message = EXCLUDED.ui_message,
              needs_user_choice = EXCLUDED.needs_user_choice,
              last_updated = NOW()
            `,
            {
              replacements: {
                proposalId: proposal.proposal_id,
                runId: output.run_id,
                inventoryId: output.inventory_id,
                cityId: output.city_id,
                sectorCode: output.sector_code,
                subsectorCode: proposal.subsector_code,
                status: proposal.status,
                recommended: JSON.stringify(proposal.recommended ?? null),
                alternatives: JSON.stringify(proposal.alternatives ?? []),
                rationale: proposal.rationale,
                uiMessage: proposal.ui_message,
                needsUserChoice: proposal.needs_user_choice,
              },
            },
          ),
        ),
      );
    } catch (error) {
      logger.warn(
        { error },
        "Unable to persist inventory draft proposals. Run migrations to enable staging.",
      );
    }
  }

  private static async findStoredProposals(
    inventoryId: string,
    proposalIds: string[],
  ) {
    if (proposalIds.length === 0) {
      return new Map<string, StoredProposal>();
    }

    const [rows] = (await db.sequelize!.query(
      `
      SELECT
        proposal_id AS "proposalId",
        recommended,
        alternatives
      FROM "ProposedInventoryChange"
      WHERE inventory_id = :inventoryId
      AND proposal_id IN (:proposalIds)
      `,
      {
        replacements: { inventoryId, proposalIds },
      },
    )) as [StoredProposal[], unknown];

    return new Map(rows.map((row) => [row.proposalId, row]));
  }

  private static resolveDecisionSourceId(
    proposal: StoredProposal,
    decision: DraftReviewDecision,
  ) {
    if (decision.action === "accept") {
      return proposal.recommended?.source_id;
    }

    if (decision.selectedSourceId) {
      return decision.selectedSourceId;
    }

    if (decision.selectedSourceName) {
      return proposal.alternatives?.find(
        (candidate) => candidate.source_name === decision.selectedSourceName,
      )?.source_id;
    }

    return undefined;
  }

  private static async updateStoredDecision({
    inventoryId,
    decision,
    status,
    selectedSourceId,
    selectedSourceName,
    appliedInventoryValueId,
    userId,
  }: {
    inventoryId: string;
    decision: DraftReviewDecision;
    status: string;
    selectedSourceId?: string;
    selectedSourceName?: string;
    appliedInventoryValueId?: string;
    userId?: string;
  }) {
    await db.sequelize!.query(
      `
      UPDATE "ProposedInventoryChange"
      SET
        status = :status,
        decision = :decisionAction,
        selected_source_id = :selectedSourceId,
        selected_source_name = :selectedSourceName,
        override_value = :overrideValue,
        override_unit = :overrideUnit,
        decision_note = :decisionNote,
        decided_by = :userId,
        decided_at = NOW(),
        applied_inventory_value_id = :appliedInventoryValueId,
        last_updated = NOW()
      WHERE inventory_id = :inventoryId
      AND proposal_id = :proposalId
      `,
      {
        replacements: {
          status,
          decisionAction: decision.action,
          selectedSourceId:
            selectedSourceId || decision.selectedSourceId || null,
          selectedSourceName:
            selectedSourceName || decision.selectedSourceName || null,
          overrideValue: decision.overrideValue ?? null,
          overrideUnit: decision.overrideUnit || null,
          decisionNote: decision.note || null,
          userId: userId || null,
          appliedInventoryValueId: appliedInventoryValueId || null,
          inventoryId,
          proposalId: decision.proposalId,
        },
      },
    );
  }
}
