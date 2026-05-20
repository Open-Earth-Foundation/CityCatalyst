"use client";

/* eslint-disable i18next/no-literal-string */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./stationary-energy-draft.module.css";

type DraftProposalStatus = "ready" | "conflict" | "gap";

type DraftSourceCandidate = {
  source_id?: string;
  source_name: string;
  value?: number | null;
  unit?: string | null;
  year?: number | null;
  tier?: number | null;
  method?: string | null;
  geography_match: string;
  coverage: string;
  confidence?: number | null;
  citation?: string | null;
};

type DraftRecommendation = {
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

type SubsectorDraftProposal = {
  proposal_id: string;
  subsector_code: string;
  status: DraftProposalStatus;
  recommended?: DraftRecommendation | null;
  alternatives: DraftSourceCandidate[];
  rationale: string;
  ui_message: string;
  needs_user_choice: boolean;
};

type DraftRun = {
  draft: {
    run_id: string;
    inventory_id: string;
    city_id: string;
    city_name: string;
    locode: string;
    sector_code: string;
    locale: "en" | "es" | "pt";
    proposals: SubsectorDraftProposal[];
  };
  request: {
    inventory: {
      inventory_id: string;
      city_id: string;
      city_name: string;
      locode: string;
      country_code?: string | null;
      year: number;
      locale: string;
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
  };
  callChain: {
    owner: string;
    path: string;
    data: string[];
  }[];
  usedClimateAdvisor: boolean;
};

type ReviewResult = {
  applied: {
    proposalId: string;
    dataSourceId: string;
    inventoryValueId?: string;
  }[];
  staged: { proposalId: string; action: string }[];
  failed: { proposalId: string; issue: string }[];
};

const openingRows = ["I.1", "I.2", "I.3", "I.4", "I.5", "I.6"];

function getParam(params: Record<string, string | string[]>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatValue(value?: number | null) {
  if (value == null) {
    return "empty";
  }
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function sourceTag(source?: DraftRecommendation | DraftSourceCandidate | null) {
  if (!source) {
    return "NO SOURCE";
  }
  const tier =
    "source_tier" in source
      ? source.source_tier
      : (source as DraftSourceCandidate).tier;
  return `${source.source_name}${tier ? ` - TIER ${tier}` : ""}`;
}

export default function StationaryEnergyDraftPage() {
  const params = useParams<Record<string, string | string[]>>();
  const lng = getParam(params, "lng") || "en";
  const cityId = getParam(params, "cityId");
  const inventory = getParam(params, "inventory");

  const [draftRun, setDraftRun] = useState<DraftRun | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [status, setStatus] = useState<
    "opening" | "working" | "done" | "accepted" | "error"
  >("opening");
  const [error, setError] = useState<string | null>(null);

  const currentStateBySubsector = useMemo(
    () =>
      new Map(
        (draftRun?.request.current_state ?? []).map((state) => [
          state.subsector_code,
          state,
        ]),
      ),
    [draftRun],
  );

  const summary = useMemo(() => {
    const proposals = draftRun?.draft.proposals ?? [];
    const committed = proposals.filter((proposal) => {
      const state = currentStateBySubsector.get(proposal.subsector_code);
      return state?.existing_value != null;
    }).length;

    return {
      drafted: proposals.filter((proposal) => proposal.recommended).length,
      committed,
      gaps: proposals.filter((proposal) => {
        const state = currentStateBySubsector.get(proposal.subsector_code);
        return proposal.status === "gap" && state?.existing_value == null;
      }).length,
      conflicts: proposals.filter((proposal) => proposal.status === "conflict")
        .length,
      sources: Array.from(
        new Set(
          proposals
            .map((proposal) => proposal.recommended?.source_name)
            .filter(Boolean),
        ),
      ),
    };
  }, [draftRun, currentStateBySubsector]);

  async function createDraft() {
    if (!cityId || !inventory) {
      return;
    }
    setStatus("working");
    setError(null);
    setReviewResult(null);

    try {
      const response = await fetch(
        `/api/v1/inventory/${inventory}/draft/stationary-energy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId,
            locale: lng === "es" || lng === "pt" ? lng : "en",
            sectorCode: "I",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      setDraftRun(payload.data);
      setStatus("done");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Drafting failed");
    }
  }

  async function reviewDrafts(mode: "accept_all" | "leave_all") {
    if (!cityId || !inventory || !draftRun) {
      return;
    }

    setError(null);
    const decisions = draftRun.draft.proposals.map((proposal) => ({
      proposalId: proposal.proposal_id,
      subsectorCode: proposal.subsector_code,
      action:
        mode === "leave_all" || !proposal.recommended
          ? "leave_draft"
          : "accept",
    }));

    try {
      const response = await fetch(
        `/api/v1/inventory/${inventory}/draft/stationary-energy/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId,
            sectorCode: "I",
            decisions,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      setReviewResult(payload.data);
      setStatus(mode === "accept_all" ? "accepted" : "done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review failed");
    }
  }

  async function chooseAlternative(
    proposal: SubsectorDraftProposal,
    alternative: DraftSourceCandidate,
  ) {
    if (!cityId || !inventory || !alternative.source_id) {
      return;
    }

    try {
      const response = await fetch(
        `/api/v1/inventory/${inventory}/draft/stationary-energy/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId,
            sectorCode: "I",
            decisions: [
              {
                proposalId: proposal.proposal_id,
                subsectorCode: proposal.subsector_code,
                action: "override",
                selectedSourceId: alternative.source_id,
                selectedSourceName: alternative.source_name,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      setReviewResult(payload.data);
      setStatus("accepted");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Override failed");
    }
  }

  const proposals = draftRun?.draft.proposals ?? [];
  const rows =
    draftRun?.request.sector.subsectors.map((subsector) => subsector.code) ??
    openingRows;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.breadcrumb}>
            CityCatalyst / Inventory / {draftRun?.draft.city_name ?? "City"} -{" "}
            {draftRun?.request.inventory.year ?? "year"}
          </p>
          <h1>
            Complete inventory <span>- Stationary energy</span>
          </h1>
        </div>
        <Link
          href={`/${lng}/cities/${cityId}/GHGI/${inventory}/data/1`}
          className={styles.legacyLink}
        >
          Switch to legacy form
        </Link>
      </header>

      <section className={styles.layout}>
        <div className={styles.canvas}>
          {draftRun && (
            <div className={styles.reviewBanner}>
              <strong>
                {summary.committed} committed - {summary.drafted} drafts ready
                - {summary.gaps} gaps
              </strong>
              <div>
                <button onClick={() => reviewDrafts("accept_all")}>
                  Accept all
                </button>
                <button onClick={() => reviewDrafts("leave_all")}>
                  Leave as drafts
                </button>
              </div>
            </div>
          )}

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Subsector</span>
              <span>Draft value</span>
              <span>Source</span>
              <span>Status</span>
            </div>
            {rows.map((code) => {
              const proposal = proposals.find(
                (item) => item.subsector_code === code,
              );
              const currentState = currentStateBySubsector.get(code);
              const hasCommittedValue = currentState?.existing_value != null;
              const rowStatus =
                hasCommittedValue && !proposal?.recommended
                  ? "committed"
                  : (proposal?.status ?? "idle");

              return (
                <div className={styles.tableRow} key={code}>
                  <div>
                    <strong>{code}</strong>
                    <span>
                      {hasCommittedValue
                        ? "Committed in inventory"
                        : draftRun
                          ? "Stationary Energy row"
                          : "empty"}
                    </span>
                  </div>
                  <div>
                    {proposal?.recommended ? (
                      <div
                        className={
                          status === "accepted"
                            ? styles.committedCell
                            : styles.draftCell
                        }
                      >
                        {formatValue(proposal.recommended.value)}
                        <small>{proposal.recommended.unit}</small>
                      </div>
                    ) : hasCommittedValue ? (
                      <div className={styles.committedCell}>
                        {formatValue(currentState.existing_value)}
                        <small>{currentState.existing_unit || "kgCO2e"}</small>
                      </div>
                    ) : (
                      <em>{status === "working" ? "queued" : "empty"}</em>
                    )}
                  </div>
                  <div className={styles.source}>
                    {proposal?.recommended
                      ? sourceTag(proposal.recommended)
                      : hasCommittedValue
                        ? currentState.source_name || "Committed source"
                      : "-"}
                  </div>
                  <div>
                    <span
                      className={`${styles.statusPill} ${styles[rowStatus]}`}
                    >
                      {rowStatus}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className={styles.agentRail}>
          <div className={styles.agentHeader}>
            <span>Agent</span>
            <strong>
              {status === "working"
                ? "working"
                : status === "accepted"
                  ? "saved"
                  : status === "done"
                    ? "done"
                    : "ready"}
            </strong>
          </div>

          {status === "opening" && (
            <>
              <p className={styles.bubble}>
                I will fetch city-scoped approved sources for this inventory and
                draft Stationary Energy only.
              </p>
              <p className={styles.bubble}>
                You will review every value before anything saves.
              </p>
              <button className={styles.primary} onClick={createDraft}>
                Yes, draft them
              </button>
            </>
          )}

          {status === "working" && (
            <div className={styles.statusStrip}>
              Drafting I - fetching approved Global API sources for city{" "}
              {cityId}
            </div>
          )}

          {draftRun && (
            <>
              <div className={styles.summary}>
                <strong>
                  {status === "accepted" ? "Saved" : "~45 min saved"}
                </strong>
                <span>
                  {summary.committed} committed - {summary.drafted} drafted -{" "}
                  {summary.conflicts} conflicts - {summary.gaps} gaps
                </span>
                <small>
                  Sources: {summary.sources.join(", ") || "none available"}
                </small>
              </div>

              <div className={styles.chain}>
                <h2>Call chain</h2>
                {draftRun.callChain.map((step) => (
                  <div key={step.path} className={styles.chainStep}>
                    <strong>{step.owner}</strong>
                    <code>{step.path}</code>
                    <span>{step.data.join(", ")}</span>
                  </div>
                ))}
              </div>

              {proposals
                .filter((proposal) => proposal.status === "conflict")
                .map((proposal) => (
                  <div
                    className={styles.decisionCard}
                    key={proposal.proposal_id}
                  >
                    <strong>{proposal.subsector_code} - sources differ</strong>
                    <p>{proposal.rationale}</p>
                    {proposal.alternatives.slice(0, 2).map((alternative) => (
                      <button
                        key={alternative.source_id || alternative.source_name}
                        onClick={() => chooseAlternative(proposal, alternative)}
                      >
                        Use {alternative.source_name}
                      </button>
                    ))}
                  </div>
                ))}

              {summary.gaps > 0 && (
                <div className={styles.decisionCard}>
                  <strong>
                    {summary.gaps} subsectors have no third-party data.
                  </strong>
                  <p>
                    Enter manually, mark as Not Estimated, or leave the draft
                    state for later review.
                  </p>
                </div>
              )}
            </>
          )}

          {reviewResult && (
            <div className={styles.reviewResult}>
              <strong>Review result</strong>
              <span>{reviewResult.applied.length} applied</span>
              <span>{reviewResult.staged.length} left as drafts</span>
              <span>{reviewResult.failed.length} failed</span>
            </div>
          )}

          {error && <pre className={styles.error}>{error}</pre>}
        </aside>
      </section>
    </main>
  );
}
