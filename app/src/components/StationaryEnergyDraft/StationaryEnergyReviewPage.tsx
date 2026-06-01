"use client";
/* eslint-disable i18next/no-literal-string */

import ProgressLoader from "@/components/ProgressLoader";
import { Button } from "@/components/ui/button";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import Wrapper from "@/components/wrapper";
import { api } from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { getParamValueRequired } from "@/util/helpers";
import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdArrowBack, MdSave, MdSend } from "react-icons/md";
import { readStoredDraftContext, writeStoredDraftContext } from "./storage";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftStatusResponse,
  ReviewResponse,
  SaveResponse,
} from "./types";
import {
  compatibleSources,
  currentValueLabel,
  findRecommendedSource,
  initialDecisionForProposal,
  proposalLabel,
  proposedValueLabel,
  readJson,
  sourceLabel,
} from "./utils";

type LoadingAction = "refresh" | "review" | "save" | null;

export default function StationaryEnergyReviewPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const lng = getParamValueRequired(params.lng);
  const cityId = getParamValueRequired(params.cityId);
  const inventoryId = getParamValueRequired(params.inventory);
  const featureEnabled =
    hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) &&
    hasFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC);
  const queryDraftRunId = searchParams.get("draftRunId");

  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryQuery(inventoryId, {
      skip: !inventoryId,
    });

  const [storedDraftRunId, setStoredDraftRunId] = useState<string | null>(null);
  const draftRunId = queryDraftRunId ?? storedDraftRunId;
  const [draftState, setDraftState] = useState<DraftStatusResponse | null>(
    null,
  );
  const [decisionState, setDecisionState] = useState<
    Record<string, DraftDecisionState>
  >({});
  const [reviewResponse, setReviewResponse] = useState<ReviewResponse | null>(
    null,
  );
  const [saveResponse, setSaveResponse] = useState<SaveResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  const latestReviewDecisions = useMemo(
    () => draftState?.review_decisions ?? [],
    [draftState?.review_decisions],
  );
  const canSave = latestReviewDecisions.some(
    (decision) => decision.commit_status === "pending_cc_commit",
  );

  const statusSummary = useMemo(() => {
    const decisions = latestReviewDecisions;
    return {
      pending: decisions.filter(
        (decision) => decision.commit_status === "pending_cc_commit",
      ).length,
      stagedManual: decisions.filter(
        (decision) => decision.commit_status === "staged_manual",
      ).length,
      committed: decisions.filter(
        (decision) => decision.commit_status === "committed",
      ).length,
      leftDraft: decisions.filter(
        (decision) => decision.action === "leave_draft",
      ).length,
    };
  }, [latestReviewDecisions]);

  const refreshDraftStatus = useCallback(
    async (id: string) => {
      setLoadingAction("refresh");
      try {
        const response = await fetch(
          `/api/v1/stationary-energy-drafts/${id}?inventory_id=${encodeURIComponent(inventoryId)}`,
        );
        const payload = await readJson<DraftStatusResponse>(
          response,
          "Failed to load Stationary Energy draft status",
        );
        setDraftState(payload);
        writeStoredDraftContext(inventoryId, {
          draftRunId: payload.draft_run_id,
          threadId: payload.thread_id ?? null,
        });
        return payload;
      } finally {
        setLoadingAction(null);
      }
    },
    [inventoryId],
  );

  useEffect(() => {
    if (queryDraftRunId) {
      return;
    }

    setStoredDraftRunId(
      readStoredDraftContext(inventoryId)?.draftRunId ?? null,
    );
  }, [inventoryId, queryDraftRunId]);

  useEffect(() => {
    if (!draftRunId || !featureEnabled) {
      return;
    }

    void refreshDraftStatus(draftRunId).catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load draft",
      );
    });
  }, [draftRunId, featureEnabled, refreshDraftStatus]);

  useEffect(() => {
    if (!draftState) {
      return;
    }

    setDecisionState((current) => {
      const next = { ...current };
      let changed = false;

      for (const proposal of draftState.proposals) {
        if (next[proposal.proposal_id]) {
          continue;
        }

        next[proposal.proposal_id] = initialDecisionForProposal(
          proposal,
          draftState.source_candidates,
        );
        changed = true;
      }

      return changed ? next : current;
    });
  }, [draftState]);

  async function handleReviewDraft() {
    if (!draftState) {
      return;
    }

    setErrorMessage(null);
    setLoadingAction("review");
    try {
      const decisions = draftState.proposals.map((proposal) => {
        const state =
          decisionState[proposal.proposal_id] ??
          initialDecisionForProposal(proposal, draftState.source_candidates);

        return {
          proposal_id: proposal.proposal_id,
          action: state.action,
          selected_source_id:
            state.action === "override_source"
              ? state.selectedSourceId
              : undefined,
          manual_value:
            state.action === "override_manual" && state.manualValue
              ? Number(state.manualValue)
              : undefined,
          manual_unit:
            state.action === "override_manual" && state.manualUnit
              ? state.manualUnit
              : undefined,
          note: state.note || undefined,
        };
      });

      const response = await fetch(
        `/api/v1/stationary-energy-drafts/${draftState.draft_run_id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventory_id: inventoryId,
            decisions,
          }),
        },
      );
      const payload = await readJson<ReviewResponse>(
        response,
        "Failed to submit Stationary Energy review decisions",
      );
      setReviewResponse(payload);
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit review",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSaveDraft() {
    if (!draftState) {
      return;
    }

    setErrorMessage(null);
    setLoadingAction("save");
    try {
      const response = await fetch(
        `/api/v1/stationary-energy-drafts/${draftState.draft_run_id}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventory_id: inventoryId,
          }),
        },
      );
      const payload = await readJson<SaveResponse>(
        response,
        "Failed to save accepted Stationary Energy rows",
      );
      setSaveResponse(payload);
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save accepted rows",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  function setProposalDecision(
    proposalId: string,
    patch: Partial<DraftDecisionState>,
  ) {
    setDecisionState((current) => ({
      ...current,
      [proposalId]: {
        action: current[proposalId]?.action ?? "leave_draft",
        selectedSourceId: current[proposalId]?.selectedSourceId ?? "",
        manualValue: current[proposalId]?.manualValue ?? "",
        manualUnit: current[proposalId]?.manualUnit ?? "",
        note: current[proposalId]?.note ?? "",
        ...patch,
      },
    }));
  }

  if (inventoryLoading) {
    return <ProgressLoader />;
  }

  const cityName = inventory?.city?.name ?? "Selected city";
  const decisionsHref = `/${lng}/cities/${cityId}/GHGI/${inventoryId}/draft/stationary-energy`;

  return (
    <Wrapper>
      <VStack align="stretch" gap={8} pb={16}>
        <Flex
          justifyContent="space-between"
          alignItems={{ base: "flex-start", md: "center" }}
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
        >
          <Box>
            <Button
              variant="ghost"
              justifyContent="flex-start"
              maxW="220px"
              gap={2}
              mb={4}
              onClick={() => router.push(decisionsHref)}
            >
              <MdArrowBack />
              Back to decisions
            </Button>
            <Heading
              color="content.primary"
              fontFamily="heading"
              fontSize="headline.lg"
              fontWeight="bold"
            >
              Draft Review
            </Heading>
            <Text color="content.tertiary" fontSize="body.lg" mt={2}>
              Accept, switch source, enter a manual override, or leave each
              proposal as a draft before saving accepted source-backed rows.
            </Text>
          </Box>
          <HStack gap={2} flexWrap="wrap">
            <Badge>{cityName}</Badge>
            <Badge>{inventory?.year ?? "Inventory year unavailable"}</Badge>
            <Badge>
              {draftState ? `Draft ${draftState.status}` : "No draft"}
            </Badge>
          </HStack>
        </Flex>

        {!featureEnabled && (
          <Box
            borderWidth="1px"
            borderColor="border.neutral"
            borderRadius="rounded"
            p={5}
          >
            <Text color="content.primary" fontWeight="semibold">
              Enable `CA_SERVICE_INTEGRATION` and `STATIONARY_ENERGY_AGENTIC` to
              use this workflow.
            </Text>
          </Box>
        )}

        {featureEnabled && !draftRunId && (
          <Box
            borderWidth="1px"
            borderColor="border.neutral"
            borderRadius="rounded"
            p={6}
          >
            <Heading fontSize="title.md" fontWeight="semibold">
              No draft run is selected.
            </Heading>
            <Text color="content.tertiary" mt={2}>
              Start or resume a Stationary Energy draft from the decisions page
              before opening review.
            </Text>
            <NextLink href={decisionsHref}>
              <Button mt={4}>Open decisions page</Button>
            </NextLink>
          </Box>
        )}

        {errorMessage && (
          <Box
            borderWidth="1px"
            borderColor="sentiment.negativeDefault"
            borderRadius="rounded"
            color="sentiment.negativeDefault"
            px={4}
            py={3}
          >
            {errorMessage}
          </Box>
        )}

        {featureEnabled && draftState && (
          <SimpleGrid columns={{ base: 1, xl: 3 }} gap={6} alignItems="start">
            <VStack
              align="stretch"
              gap={4}
              gridColumn={{ base: "auto", xl: "span 2" }}
            >
              {draftState.proposals.map((proposal) => {
                const matchingCandidates = compatibleSources(
                  proposal,
                  draftState.source_candidates,
                );
                const recommendedSource = findRecommendedSource(
                  proposal,
                  draftState.source_candidates,
                );
                const decision =
                  decisionState[proposal.proposal_id] ??
                  initialDecisionForProposal(
                    proposal,
                    draftState.source_candidates,
                  );
                const canAccept = Boolean(proposal.recommended_candidate_id);

                return (
                  <Box
                    key={proposal.proposal_id}
                    borderWidth="1px"
                    borderColor="border.neutral"
                    borderRadius="rounded"
                    p={5}
                    bg="base.light"
                  >
                    <Flex
                      justifyContent="space-between"
                      alignItems={{ base: "flex-start", md: "center" }}
                      flexDirection={{ base: "column", md: "row" }}
                      gap={3}
                    >
                      <Box>
                        <Heading fontSize="title.md" fontWeight="semibold">
                          {proposalLabel(proposal)}
                        </Heading>
                        <Text color="content.tertiary" mt={1}>
                          Current: {currentValueLabel(proposal)}
                        </Text>
                      </Box>
                      <HStack gap={2} flexWrap="wrap">
                        <Badge>{proposal.status}</Badge>
                        {proposal.confidence_score != null && (
                          <Badge>{`Confidence ${proposal.confidence_score}`}</Badge>
                        )}
                      </HStack>
                    </Flex>

                    <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={4}>
                      <Box>
                        <Text color="content.tertiary" fontSize="label.md">
                          Recommended draft
                        </Text>
                        <Text fontWeight="semibold">
                          {proposedValueLabel(proposal)}
                        </Text>
                      </Box>
                      <Box>
                        <Text color="content.tertiary" fontSize="label.md">
                          Recommended source
                        </Text>
                        <Text fontWeight="semibold">
                          {sourceLabel(recommendedSource)}
                        </Text>
                      </Box>
                    </SimpleGrid>

                    <Text color="content.primary" mt={4}>
                      {proposal.rationale ?? "No rationale returned."}
                    </Text>

                    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4} mt={5}>
                      <Box>
                        <Text
                          color="content.tertiary"
                          fontSize="label.md"
                          mb={2}
                        >
                          Decision
                        </Text>
                        <NativeSelectRoot>
                          <NativeSelectField
                            data-testid={`proposal-action-${proposal.proposal_id}`}
                            value={decision.action}
                            onChange={(event) => {
                              setProposalDecision(proposal.proposal_id, {
                                action: event.target
                                  .value as DraftDecisionAction,
                              });
                            }}
                          >
                            {canAccept && (
                              <option value="accept">
                                Accept recommended source
                              </option>
                            )}
                            {matchingCandidates.length > 0 && (
                              <option value="override_source">
                                Choose another source
                              </option>
                            )}
                            <option value="override_manual">
                              Enter manual value
                            </option>
                            <option value="leave_draft">Leave as draft</option>
                          </NativeSelectField>
                        </NativeSelectRoot>
                      </Box>

                      <Box>
                        <Text
                          color="content.tertiary"
                          fontSize="label.md"
                          mb={2}
                        >
                          Source override
                        </Text>
                        <NativeSelectRoot
                          disabled={decision.action !== "override_source"}
                        >
                          <NativeSelectField
                            data-testid={`proposal-source-${proposal.proposal_id}`}
                            value={decision.selectedSourceId}
                            onChange={(event) => {
                              setProposalDecision(proposal.proposal_id, {
                                selectedSourceId: event.target.value,
                              });
                            }}
                          >
                            <option value="">Select a compatible source</option>
                            {matchingCandidates.map((candidate) => (
                              <option
                                key={
                                  candidate.candidate_id ??
                                  candidate.datasource_id
                                }
                                value={
                                  candidate.candidate_id ??
                                  candidate.datasource_id
                                }
                              >
                                {sourceLabel(candidate)}
                              </option>
                            ))}
                          </NativeSelectField>
                        </NativeSelectRoot>
                      </Box>
                    </SimpleGrid>

                    {decision.action === "override_manual" && (
                      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={4}>
                        <Box>
                          <Text
                            color="content.tertiary"
                            fontSize="label.md"
                            mb={2}
                          >
                            Manual value
                          </Text>
                          <Input
                            data-testid={`proposal-manual-value-${proposal.proposal_id}`}
                            type="number"
                            value={decision.manualValue}
                            onChange={(event) =>
                              setProposalDecision(proposal.proposal_id, {
                                manualValue: event.target.value,
                              })
                            }
                          />
                        </Box>
                        <Box>
                          <Text
                            color="content.tertiary"
                            fontSize="label.md"
                            mb={2}
                          >
                            Manual unit
                          </Text>
                          <Input
                            data-testid={`proposal-manual-unit-${proposal.proposal_id}`}
                            value={decision.manualUnit}
                            onChange={(event) =>
                              setProposalDecision(proposal.proposal_id, {
                                manualUnit: event.target.value,
                              })
                            }
                            placeholder="For example, tCO2e"
                          />
                        </Box>
                      </SimpleGrid>
                    )}

                    <Box mt={4}>
                      <Text color="content.tertiary" fontSize="label.md" mb={2}>
                        Reviewer note
                      </Text>
                      <Input
                        data-testid={`proposal-note-${proposal.proposal_id}`}
                        value={decision.note}
                        onChange={(event) =>
                          setProposalDecision(proposal.proposal_id, {
                            note: event.target.value,
                          })
                        }
                        placeholder="Optional note"
                      />
                    </Box>
                  </Box>
                );
              })}
            </VStack>

            <Box
              borderWidth="1px"
              borderColor="border.neutral"
              borderRadius="rounded"
              p={5}
              bg="base.light"
              position={{ base: "static", xl: "sticky" }}
              top={6}
            >
              <Heading fontSize="title.lg" fontWeight="semibold">
                Final Save
              </Heading>
              <Text color="content.tertiary" mt={2}>
                Review decisions are stored in CA first. Accepted source-backed
                rows are saved to CityCatalyst only after the final save action.
              </Text>

              <SimpleGrid columns={2} gap={3} mt={5}>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Pending save
                  </Text>
                  <Text fontSize="title.lg" fontWeight="semibold">
                    {statusSummary.pending}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Manual staged
                  </Text>
                  <Text fontSize="title.lg" fontWeight="semibold">
                    {statusSummary.stagedManual}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Committed
                  </Text>
                  <Text fontSize="title.lg" fontWeight="semibold">
                    {statusSummary.committed}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Left draft
                  </Text>
                  <Text fontSize="title.lg" fontWeight="semibold">
                    {statusSummary.leftDraft}
                  </Text>
                </Box>
              </SimpleGrid>

              <VStack align="stretch" gap={3} mt={6}>
                <Button
                  data-testid="submit-review-button"
                  variant="outline"
                  loading={loadingAction === "review"}
                  onClick={() => {
                    void handleReviewDraft();
                  }}
                >
                  <MdSend />
                  Submit review decisions
                </Button>
                <Button
                  data-testid="save-draft-button"
                  disabled={!canSave}
                  loading={loadingAction === "save"}
                  onClick={() => {
                    void handleSaveDraft();
                  }}
                >
                  <MdSave />
                  Save accepted rows
                </Button>
                {reviewResponse && (
                  <Text color="content.tertiary">
                    Review status: {reviewResponse.status}
                  </Text>
                )}
                {saveResponse && (
                  <Text color="content.tertiary">
                    Save status: {saveResponse.status}
                  </Text>
                )}
              </VStack>
            </Box>
          </SimpleGrid>
        )}
      </VStack>
    </Wrapper>
  );
}
