"use client";
/* eslint-disable i18next/no-literal-string */

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import styles from "./showcase.module.css";

type Stage =
  | "opening"
  | "drafting"
  | "conflict"
  | "gaps"
  | "review"
  | "accepted";

type ConflictChoice = "ClimateTRACE" | "SEEG";

type DraftRow = {
  code: string;
  label: string;
  seegValue?: string;
  climateTraceValue?: string;
  defaultValue?: string;
  source?: string;
  tier?: string;
  detail: string;
  status: "draft" | "conflict" | "gap";
};

const stageOrder: Stage[] = [
  "opening",
  "drafting",
  "conflict",
  "gaps",
  "review",
  "accepted",
];

const stageLabels: Record<Stage, string> = {
  opening: "Opening",
  drafting: "Drafting",
  conflict: "Conflict",
  gaps: "Gaps",
  review: "Review",
  accepted: "Accepted",
};

const draftRows: DraftRow[] = [
  {
    code: "I.1",
    label: "Residential",
    defaultValue: "412 GWh",
    source: "SEEG",
    tier: "Tier 2",
    detail:
      "SEEG 2023 stationary energy extract. Residential electricity and fuel demand normalized to the city-year inventory frame.",
    status: "draft",
  },
  {
    code: "I.2",
    label: "Commercial & institutional",
    defaultValue: "185 GWh",
    source: "SEEG",
    tier: "Tier 2",
    detail:
      "SEEG commercial demand series, mapped to CityCatalyst subsector I.2 and converted to the existing inventory unit pattern.",
    status: "draft",
  },
  {
    code: "I.3",
    label: "Manufacturing & construction",
    seegValue: "720 GWh",
    climateTraceValue: "874 GWh",
    source: "ClimateTRACE",
    tier: "Tier 3",
    detail:
      "Conflict case. SEEG is a 2021 proxy with missing industrial breakdown for 2023. ClimateTRACE provides direct 2023 facility-level coverage.",
    status: "conflict",
  },
  {
    code: "I.4",
    label: "Energy industries",
    defaultValue: "91 GWh",
    source: "ClimateTRACE",
    tier: "Tier 3",
    detail:
      "ClimateTRACE direct facility measurements, aligned to the inventory year and tagged as a Tier 3 draft with direct-source provenance.",
    status: "draft",
  },
  {
    code: "I.5",
    label: "Agriculture, forestry & fishing",
    detail:
      "No validated third-party source available for the selected city-year pair. The user can enter manually, mark Not Estimated, or upload a report.",
    status: "gap",
  },
  {
    code: "I.6",
    label: "Non-specified",
    detail:
      "No validated third-party source available for the selected city-year pair. The user can enter manually, mark Not Estimated, or upload a report.",
    status: "gap",
  },
];

const integrationLanes = [
  {
    title: "Recommended production route",
    body:
      "/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy. The entry CTA lives on the existing inventory sector header, but the drafting flow runs on its own page.",
  },
  {
    title: "Frontend surface",
    body:
      "A two-column drafting page: inventory canvas on the left, contained agent rail on the right, inline draft cells, visible provenance tags, and an acceptance banner.",
  },
  {
    title: "CityCatalyst application",
    body:
      "Read current inventory state, fetch any existing subsector values, stage proposed changes, write accepted values through the current inventory endpoints, and record version history.",
  },
  {
    title: "Climate Advisor runtime",
    body:
      "Reuse auth, model routing, tracing, and tool execution. Add one purpose-built Bulk Filler skill with sector-scoped tools and locale-aware prompt behavior.",
  },
  {
    title: "Third-party data layer",
    body:
      "Reuse Global API access, bulk-created BPJP inventories, and the existing data-combine logic that already drafts Brazilian municipalities from external sources.",
  },
  {
    title: "Governance and audit",
    body:
      "Persist every proposal, accepted alternative, user override, and provenance payload so reviewers can see exactly what the system suggested and why it was committed.",
  },
];

const sprintPlan = [
  {
    title: "Sprint 1",
    focus: "Route, layout, seeded drafting loop",
    items: [
      "Create the new drafting route and sector entry CTA.",
      "Render the two-column layout and inline draft-cell pattern.",
      "Connect read-only inventory state and source-fetch tooling.",
      "Let one operator watch Stationary Energy populate as proposals only.",
    ],
  },
  {
    title: "Sprint 2",
    focus: "Resolve, accept, commit",
    items: [
      "Add conflict and gap cards with deterministic user actions.",
      "Persist proposals and decisions with an audit trail.",
      "Commit accepted values through current write endpoints.",
      "Pilot the full loop with one OEF operator and one city contact.",
    ],
  },
];

const responsibilityPanels = [
  {
    title: "CityCatalyst page + API",
    body:
      "Owns scope, permissions, sector state loading, candidate normalization, draft staging, and final commit. It decides what sector is being filled and what approved data is handed to Climate Advisor.",
  },
  {
    title: "Climate Advisor",
    body:
      "Owns one job only: choose among approved source candidates, explain the pick, surface conflicts, and mark gaps. It does not search arbitrary data or write directly to inventory tables.",
  },
  {
    title: "Source layer",
    body:
      "Owns data retrieval from allow-listed sources such as SEEG, ClimateTRACE, and existing BPJP bulk outputs. It returns normalized candidate values with tier, method, year, confidence, and citation.",
  },
];

const caContractCards = [
  {
    title: "What CA receives",
    items: [
      "Inventory scope: city_id, city_name, locode, year, locale, sector, subsectors",
      "Current sector state: existing values, notations, locked rows",
      "Normalized candidates per subsector from approved sources only",
      "Policy flags: allowed sources, conflict threshold, acceptance required",
    ],
  },
  {
    title: "How CA decides",
    items: [
      "Prefer exact city-year and exact subsector match",
      "Never cross the target city boundary",
      "Prefer better coverage before better rhetoric",
      "Use source tier and method strength as tiebreakers",
      "Return a conflict when good candidates diverge materially",
    ],
  },
  {
    title: "What CA returns",
    items: [
      "Recommended value with provenance and confidence",
      "Alternatives when sources materially disagree",
      "Gap status when no candidate clears the bar",
      "UI-ready rationale for the right-hand rail",
    ],
  },
];

function getRows(stage: Stage, conflictChoice: ConflictChoice) {
  return draftRows.map((row, index) => {
    if (stage === "opening") {
      return { ...row, view: "empty" as const };
    }

    if (stage === "drafting") {
      if (index < 2) {
        return { ...row, view: "draft" as const };
      }

      if (index === 2) {
        return { ...row, view: "active" as const };
      }

      return { ...row, view: "queued" as const };
    }

    if (row.status === "gap") {
      if (stage === "conflict") {
        return { ...row, view: "queued" as const };
      }

      return { ...row, view: "gap" as const };
    }

    if (row.status === "conflict") {
      return {
        ...row,
        view: stage === "accepted" ? ("accepted" as const) : ("conflict" as const),
        source: conflictChoice,
        tier: conflictChoice === "ClimateTRACE" ? "Tier 3" : "Tier 2",
        defaultValue:
          conflictChoice === "ClimateTRACE"
            ? row.climateTraceValue
            : row.seegValue,
      };
    }

    return {
      ...row,
      view: stage === "accepted" ? ("accepted" as const) : ("draft" as const),
    };
  });
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryPill}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Bubble({ children }: { children: ReactNode }) {
  return <div className={styles.bubble}>{children}</div>;
}

export default function AgenticInventoryShowcase({
  fontClassName,
}: {
  fontClassName: string;
}) {
  const [stage, setStage] = useState<Stage>("opening");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string>("I.3");
  const [conflictChoice, setConflictChoice] =
    useState<ConflictChoice>("ClimateTRACE");

  const rows = useMemo(
    () => getRows(stage, conflictChoice),
    [stage, conflictChoice],
  );

  const draftedCount =
    stage === "opening" ? 0 : stage === "drafting" ? 2 : 4;
  const gapCount =
    stage === "gaps" || stage === "review" || stage === "accepted" ? 2 : 0;
  const unresolvedConflicts =
    stage === "conflict" || stage === "gaps" || stage === "review" ? 1 : 0;

  const currentConflictValue =
    conflictChoice === "ClimateTRACE" ? "874 GWh" : "720 GWh";

  return (
    <div className={`${styles.page} ${fontClassName}`}>
      <section className={styles.hero}>
        <motion.div
          className={styles.heroCopy}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <div className={styles.kicker}>Static showcase - no API - no LLM</div>
          <h1 className={styles.title}>
            Build the first agentic inventory subpage as a drafting surface,
            not another chatbot.
          </h1>
          <p className={styles.lead}>
            The page below turns the prototype into a concrete CityCatalyst
            subpage: a sector-scoped drafting mode that fills Stationary Energy
            inline, shows provenance by default, and only commits after review.
          </p>
          <div className={styles.heroActions}>
            <a href="#prototype" className={styles.primaryLink}>
              Jump to prototype
            </a>
            <a href="#integration-map" className={styles.secondaryLink}>
              See build map
            </a>
          </div>
        </motion.div>

        <motion.aside
          className={styles.heroPanel}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: "easeOut" }}
        >
          <div className={styles.heroPanelLabel}>Recommended subpage</div>
          <code className={styles.routeLine}>
            /docs/agentic-inventory
          </code>
          <div className={styles.heroPanelNote}>
            Showcase route today.
            <br />
            Production route:
            <br />
            <code>
              /{"{lng}"}/cities/{"{cityId}"}/GHGI/{"{inventoryId}"}
              /draft/stationary-energy
            </code>
          </div>

          <div className={styles.heroMetrics}>
            <SummaryPill label="Pilot" value="BPJP city" />
            <SummaryPill label="First sector" value="Stationary Energy" />
            <SummaryPill label="Mode" value="Review before save" />
            <SummaryPill label="Stack" value="Static seeded UI" />
          </div>
        </motion.aside>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <div className={styles.kickerDark}>Subpage plan</div>
          <h2>What the real product subpage should be</h2>
        </div>

        <div className={styles.planGrid}>
          <div className={styles.planItem}>
            <span>Entry point</span>
            <strong>Per-sector CTA on the current inventory page</strong>
            <p>
              Users stay in the inventory workflow and opt into drafting mode
              only for the sector they want help with.
            </p>
          </div>
          <div className={styles.planItem}>
            <span>Surface</span>
            <strong>Dedicated drafting route with a contained agent rail</strong>
            <p>
              The canvas is the inventory itself. The agent speaks from the
              right rail, never from a modal or detached chat workspace.
            </p>
          </div>
          <div className={styles.planItem}>
            <span>Trust model</span>
            <strong>Draft cells inline, provenance visible by default</strong>
            <p>
              Every suggested value shows its source and tier immediately. A
              click expands the rationale, citation, and confidence.
            </p>
          </div>
          <div className={styles.planItem}>
            <span>Commit model</span>
            <strong>Persistent proposals first, write only on acceptance</strong>
            <p>
              Drafts should stage cleanly, survive refresh, and remain
              reviewable until the user explicitly accepts or overrides them.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.prototypeSection} id="prototype">
        <div className={styles.prototypeHeader}>
          <div>
            <div className={styles.kickerDark}>Interactive concept</div>
            <h2>Seeded prototype of the drafting subpage</h2>
          </div>
          <div className={styles.stageRail}>
            {stageOrder.map((value) => (
              <button
                key={value}
                className={`${styles.stageButton} ${
                  value === stage ? styles.stageButtonActive : ""
                }`}
                onClick={() => setStage(value)}
                type="button"
              >
                {stageLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.prototypeShell}>
          <div className={styles.workspace}>
            <div className={styles.inventoryNav}>
              <div className={styles.inventoryLabel}>Inventory</div>
              <div className={`${styles.inventoryGroup} ${styles.inventoryGroupActive}`}>
                <strong>I. Stationary energy</strong>
                <span>6 subsectors</span>
              </div>
              <div className={styles.inventoryGroup}>
                <strong>II. Transportation</strong>
                <span>5 subsectors</span>
              </div>
              <div className={styles.inventoryGroup}>
                <strong>III. Waste</strong>
                <span>Waiting</span>
              </div>
              <div className={styles.inventoryGroup}>
                <strong>IV. IPPU</strong>
                <span>Waiting</span>
              </div>
              <div className={styles.inventoryGroup}>
                <strong>V. AFOLU</strong>
                <span>Waiting</span>
              </div>
            </div>

            <div className={styles.canvas}>
              <div className={styles.canvasHeader}>
                <div className={styles.breadcrumbs}>
                  CityCatalyst <span>{">"}</span> Inventory <span>{">"}</span> Quilmes -
                  2023
                </div>
                <button className={styles.legacyLink} type="button">
                  Switch to legacy form
                </button>
              </div>

              <div className={styles.canvasTitleRow}>
                <h3>Complete inventory</h3>
                <span>- Stationary energy</span>
              </div>

              {(stage === "review" || stage === "accepted") && (
                <div className={styles.reviewBanner}>
                  <div>
                    {stage === "accepted"
                      ? "All drafts accepted"
                      : "4 drafts ready - 2 gaps"}
                  </div>
                  <div className={styles.reviewActions}>
                    {stage === "review" && (
                      <>
                        <button
                          type="button"
                          className={styles.bannerPrimary}
                          onClick={() => setStage("accepted")}
                        >
                          Accept all
                        </button>
                        <button
                          type="button"
                          className={styles.bannerSecondary}
                          onClick={() => setStage("conflict")}
                        >
                          Review each
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.table}>
                {rows.map((row) => (
                  <div key={row.code} className={styles.rowBlock}>
                    <button
                      className={`${styles.row} ${
                        expandedCode === row.code ? styles.rowExpanded : ""
                      }`}
                      onClick={() =>
                        setExpandedCode(expandedCode === row.code ? "" : row.code)
                      }
                      type="button"
                    >
                      <div className={styles.rowTitle}>
                        <strong>{row.code}</strong>
                        <span>{row.label}</span>
                      </div>

                      <div className={styles.rowValue}>
                        {row.view === "empty" && (
                          <em className={styles.emptyValue}>empty</em>
                        )}

                        {row.view === "queued" && (
                          <em className={styles.queuedValue}>queued</em>
                        )}

                        {row.view === "active" && (
                          <div className={`${styles.valueCard} ${styles.valueActive}`}>
                            <span>Comparing sources...</span>
                          </div>
                        )}

                        {(row.view === "draft" ||
                          row.view === "conflict" ||
                          row.view === "accepted") && (
                          <div className={styles.valueStack}>
                            <div
                              className={`${styles.valueCard} ${
                                row.view === "accepted"
                                  ? styles.valueAccepted
                                  : styles.valueDraft
                              }`}
                            >
                              <strong>{row.defaultValue}</strong>
                            </div>
                            <span className={styles.sourceTag}>
                              {row.source} - {row.tier}
                              {row.view === "conflict" && " - conflict"}
                            </span>
                          </div>
                        )}

                        {row.view === "gap" && (
                          <div className={styles.gapState}>
                            <strong>No source found</strong>
                            <span>Manual, N/E, or upload</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {expandedCode === row.code &&
                      row.view !== "empty" &&
                      row.view !== "queued" &&
                      row.view !== "active" && (
                        <div className={styles.provenance}>
                          <span>Visible provenance</span>
                          <p>{row.detail}</p>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className={styles.agentRail}>
            <div className={styles.agentHeader}>
              <div>
                <strong>Agent</strong>
                <span>
                  {stage === "opening"
                    ? "ready"
                    : stage === "accepted"
                      ? "saved"
                      : stage === "review"
                        ? "done"
                        : "working"}
                </span>
              </div>

              {(stage === "review" || stage === "accepted") && (
                <div className={styles.savedTime}>
                  <strong>~45 min saved</strong>
                  <span>vs. manual entry</span>
                </div>
              )}
            </div>

            <div className={styles.railSummary}>
              <SummaryPill label="Drafted" value={`${draftedCount}`} />
              <SummaryPill label="Gaps" value={gapCount ? "I.5, I.6" : "0"} />
              <SummaryPill
                label="Sources"
                value={draftedCount ? "SEEG, ClimateTRACE" : "waiting"}
              />
              <SummaryPill
                label="Conflicts"
                value={unresolvedConflicts ? "1 unresolved" : "0"}
              />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className={styles.railBody}
              >
                {stage === "opening" && (
                  <>
                    <Bubble>
                      I found reliable external coverage for 4 of 6 Stationary
                      Energy subsectors in Quilmes, 2023.
                    </Bubble>
                    <Bubble>
                      I can draft them inline in under a minute. Nothing saves
                      until you review and accept.
                    </Bubble>

                    <div className={styles.buttonStack}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => setStage("drafting")}
                      >
                        Yes, draft them
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setChooserOpen((value) => !value)}
                      >
                        Let me choose
                      </button>
                    </div>

                    {chooserOpen && (
                      <div className={styles.choiceCard}>
                        <strong>Which subsectors should I draft?</strong>
                        <div className={styles.choiceList}>
                          {draftRows
                            .filter((row) => row.status !== "gap")
                            .map((row) => (
                              <label key={row.code} className={styles.choiceRow}>
                                <input checked readOnly type="checkbox" />
                                <span>{row.code}</span>
                                <span>{row.label}</span>
                              </label>
                            ))}
                        </div>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => {
                            setChooserOpen(false);
                            setStage("drafting");
                          }}
                        >
                          Draft selected (4)
                        </button>
                      </div>
                    )}
                  </>
                )}

                {stage === "drafting" && (
                  <>
                    <div className={styles.statusStrip}>
                      Drafting I.3 - comparing SEEG against ClimateTRACE
                    </div>
                    <div className={styles.log}>
                      <span>[done] Drafted I.1 from SEEG</span>
                      <span>[done] Drafted I.2 from SEEG</span>
                      <span>[run] Comparing I.3 for best year coverage</span>
                    </div>
                    <div className={styles.buttonStack}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => setStage("conflict")}
                      >
                        Continue to conflict
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setStage("opening")}
                      >
                        Reset
                      </button>
                    </div>
                  </>
                )}

                {stage === "conflict" && (
                  <>
                    <div className={styles.statusStrip}>
                      Drafting complete - one source conflict needs review
                    </div>
                    <div className={`${styles.conflictCard} ${styles.conflictCardDashed}`}>
                      <span>I.3 - sources differ</span>
                      <p>
                        SEEG: 720 GWh (Tier 2). ClimateTRACE: 874 GWh (Tier 3).
                        Defaulting to ClimateTRACE because SEEG lacks a full
                        2023 industrial breakdown.
                      </p>

                      <div className={styles.conflictTable}>
                        <div>
                          <strong>SEEG</strong>
                          <span>720 GWh</span>
                          <small>2021 proxy - activity method</small>
                        </div>
                        <div className={styles.conflictTableActive}>
                          <strong>ClimateTRACE</strong>
                          <span>874 GWh</span>
                          <small>2023 direct - satellite method</small>
                        </div>
                      </div>

                      <div className={styles.buttonStack}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => {
                            setConflictChoice("ClimateTRACE");
                            setExpandedCode("I.3");
                          }}
                        >
                          Keep ClimateTRACE
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => {
                            setConflictChoice("SEEG");
                            setExpandedCode("I.3");
                          }}
                        >
                          Use SEEG
                        </button>
                      </div>
                    </div>

                    <div className={styles.choiceSummary}>
                      Current choice: <strong>{conflictChoice}</strong> -{" "}
                      {currentConflictValue}
                    </div>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setStage("gaps")}
                    >
                      Continue to gaps
                    </button>
                  </>
                )}

                {stage === "gaps" && (
                  <>
                    <div className={styles.statusStrip}>
                      4 drafts ready - 2 subsectors still need a human path
                    </div>
                    <div className={styles.gapCard}>
                      <strong>I.5 and I.6 have no third-party data.</strong>
                      <p>
                        Enter them manually, mark them Not Estimated, or upload
                        a city report for extraction on a follow-up pass.
                      </p>
                      <div className={styles.buttonRow}>
                        <button type="button" className={styles.tertiaryButton}>
                          Enter manually
                        </button>
                        <button type="button" className={styles.tertiaryButton}>
                          Mark N/E
                        </button>
                        <button type="button" className={styles.tertiaryButton}>
                          Upload report
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setStage("review")}
                    >
                      Move to review
                    </button>
                  </>
                )}

                {stage === "review" && (
                  <>
                    <Bubble>
                      Accept the drafts above, or open any row to inspect the
                      provenance before you commit.
                    </Bubble>
                    <div className={styles.reviewSummary}>
                      <strong>Review summary</strong>
                      <div>
                        <span>Drafted</span>
                        <span>4 subsectors</span>
                      </div>
                      <div>
                        <span>Gaps</span>
                        <span>I.5, I.6</span>
                      </div>
                      <div>
                        <span>Sources</span>
                        <span>SEEG, ClimateTRACE</span>
                      </div>
                    </div>
                    <div className={styles.buttonStack}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => setStage("accepted")}
                      >
                        Accept all
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setStage("conflict")}
                      >
                        Review each
                      </button>
                    </div>
                  </>
                )}

                {stage === "accepted" && (
                  <>
                    <Bubble>
                      Saved. Stationary Energy is complete. Every accepted value
                      keeps its source tag visible in the working form.
                    </Bubble>
                    <div className={styles.reviewSummary}>
                      <strong>Committed output</strong>
                      <div>
                        <span>Accepted conflict choice</span>
                        <span>{conflictChoice}</span>
                      </div>
                      <div>
                        <span>Committed drafts</span>
                        <span>4</span>
                      </div>
                      <div>
                        <span>Unfilled gaps</span>
                        <span>2</span>
                      </div>
                    </div>
                    <Bubble>
                      I also found Transportation coverage for the next pass. Do
                      you want to continue sector by sector?
                    </Bubble>
                    <div className={styles.buttonStack}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => setStage("opening")}
                      >
                        Replay flow
                      </button>
                      <button type="button" className={styles.secondaryButton}>
                        Stop here
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            <div className={styles.promptDock}>Ask the agent...</div>
          </aside>
        </div>
      </section>

      <section className={styles.section} id="integration-map">
        <div className={styles.sectionIntro}>
          <div className={styles.kickerDark}>Integration map</div>
          <h2>What needs to connect and what needs to be built</h2>
          <p>
            The product is narrow on purpose. Most leverage comes from reusing
            systems CityCatalyst already has, then adding a strict staging layer
            and one sector-focused skill on top.
          </p>
        </div>

        <div className={styles.integrationRail}>
          {integrationLanes.map((lane) => (
            <div key={lane.title} className={styles.integrationRow}>
              <div className={styles.integrationTitle}>{lane.title}</div>
              <p>{lane.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <div className={styles.kickerDark}>Responsibility split</div>
          <h2>Who is responsible for what</h2>
          <p>
            The clean boundary is this: CityCatalyst scopes and prepares the
            work, Climate Advisor chooses among approved candidates, and the
            source layer supplies the candidate data with provenance.
          </p>
        </div>

        <div className={styles.deliveryGrid}>
          {responsibilityPanels.map((panel) => (
            <div key={panel.title} className={styles.deliveryCard}>
              <span>{panel.title}</span>
              <p>{panel.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <div className={styles.kickerDark}>CA contract</div>
          <h2>What Climate Advisor gets, decides, and returns</h2>
        </div>

        <div className={styles.deliveryGrid}>
          {caContractCards.map((card) => (
            <div key={card.title} className={styles.deliveryCard}>
              <span>{card.title}</span>
              <ul>
                {card.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.deliverySection}>
        <div className={styles.sectionIntro}>
          <div className={styles.kickerDark}>Delivery</div>
          <h2>Two sprints, one sector, one pilot city</h2>
        </div>

        <div className={styles.deliveryGrid}>
          {sprintPlan.map((sprint) => (
            <div key={sprint.title} className={styles.deliveryCard}>
              <span>{sprint.title}</span>
              <strong>{sprint.focus}</strong>
              <ul>
                {sprint.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <div className={styles.deliveryCardMuted}>
            <span>Deferred on purpose</span>
            <strong>Anything outside Bulk Filler for Stationary Energy</strong>
            <p>
              No generalized agent workspace, no new multi-skill shell, no
              cross-module orchestration, and no polishing work that does not
              improve trust, speed, or acceptance.
            </p>
          </div>
        </div>

        <p className={styles.docNote}>
          Full implementation brief:{" "}
          <code>docs/agentic-inventory-big-picture.md</code>
        </p>
      </section>
    </div>
  );
}
