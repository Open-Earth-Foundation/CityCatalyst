"use client";
/* eslint-disable i18next/no-literal-string */

import ProgressLoader from "@/components/ProgressLoader";
import { Button } from "@/components/ui/button";
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
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MdArrowBack,
  MdArrowForward,
  MdCheckCircle,
  MdErrorOutline,
  MdRefresh,
} from "react-icons/md";
import {
  clearStoredDraftContext,
  readStoredDraftContext,
  writeStoredDraftContext,
} from "./storage";
import type { DraftStatusResponse } from "./types";
import {
  currentValueLabel,
  findRecommendedSource,
  proposalLabel,
  proposedValueLabel,
  readJson,
  sourceLabel,
} from "./utils";

type LoadingAction = "start" | "refresh" | null;

function countByStatus(
  proposals: DraftStatusResponse["proposals"],
  status: string,
) {
  return proposals.filter((proposal) => proposal.status === status).length;
}

export default function StationaryEnergyDecisionPage() {
  const router = useRouter();
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const cityId = getParamValueRequired(params.cityId);
  const inventoryId = getParamValueRequired(params.inventory);
  const featureEnabled =
    hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) &&
    hasFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC);

  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryQuery(inventoryId, {
      skip: !inventoryId,
    });

  const [draftState, setDraftState] = useState<DraftStatusResponse | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [resumeAttempted, setResumeAttempted] = useState(false);

  const summary = useMemo(() => {
    const proposals = draftState?.proposals ?? [];
    return {
      ready: countByStatus(proposals, "ready"),
      conflict: countByStatus(proposals, "conflict"),
      gap: countByStatus(proposals, "gap"),
      needsReview: countByStatus(proposals, "needs_review"),
    };
  }, [draftState]);

  const refreshDraftStatus = useCallback(
    async (draftRunId: string) => {
      setLoadingAction("refresh");
      try {
        const response = await fetch(
          `/api/v1/stationary-energy-drafts/${draftRunId}?inventory_id=${encodeURIComponent(inventoryId)}`,
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
    if (!inventoryId || resumeAttempted || !featureEnabled) {
      return;
    }

    setResumeAttempted(true);
    const storedContext = readStoredDraftContext(inventoryId);
    if (!storedContext) {
      return;
    }

    void refreshDraftStatus(storedContext.draftRunId).catch(() => {
      clearStoredDraftContext(inventoryId);
    });
  }, [featureEnabled, inventoryId, refreshDraftStatus, resumeAttempted]);

  async function handleStartDraft() {
    setErrorMessage(null);
    setLoadingAction("start");
    try {
      const response = await fetch("/api/v1/stationary-energy-drafts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_id: cityId,
          inventory_id: inventoryId,
          locale: lng,
        }),
      });
      const payload = await readJson<{
        draft_run_id?: string;
        thread_id?: string | null;
      }>(response, "Failed to start Stationary Energy draft");
      const draftRunId = String(payload.draft_run_id ?? "");
      if (!draftRunId) {
        throw new Error("Draft start response did not include draft_run_id.");
      }
      writeStoredDraftContext(inventoryId, {
        draftRunId,
        threadId: payload.thread_id ?? null,
      });
      await refreshDraftStatus(draftRunId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start draft",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  if (inventoryLoading) {
    return <ProgressLoader />;
  }

  const cityName = inventory?.city?.name ?? "Selected city";
  const reviewHref = draftState
    ? `/${lng}/cities/${cityId}/GHGI/${inventoryId}/draft/stationary-energy/review?draftRunId=${draftState.draft_run_id}`
    : `/${lng}/cities/${cityId}/GHGI/${inventoryId}/draft/stationary-energy/review`;

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
              onClick={() => router.back()}
            >
              <MdArrowBack />
              Back
            </Button>
            <Heading
              color="content.primary"
              fontFamily="heading"
              fontSize="headline.lg"
              fontWeight="bold"
            >
              Stationary Energy Decisions
            </Heading>
            <Text color="content.tertiary" fontSize="body.lg" mt={2}>
              Review source coverage, draft recommendations, conflicts, and gaps
              before moving to row-level review.
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

        {featureEnabled && (
          <SimpleGrid columns={{ base: 1, xl: 3 }} gap={6} alignItems="start">
            <VStack
              align="stretch"
              gap={5}
              gridColumn={{ base: "auto", xl: "span 2" }}
            >
              <Box
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
                  gap={4}
                >
                  <Box>
                    <Heading fontSize="title.lg" fontWeight="semibold">
                      Inventory Canvas
                    </Heading>
                    <Text color="content.tertiary" mt={2}>
                      Draft values remain separate from committed inventory
                      values until review and save are complete.
                    </Text>
                  </Box>
                  <HStack gap={3} flexWrap="wrap">
                    <Button
                      data-testid="start-draft-button"
                      loading={loadingAction === "start"}
                      onClick={() => {
                        void handleStartDraft();
                      }}
                    >
                      Start draft
                    </Button>
                    {draftState && (
                      <Button
                        data-testid="refresh-draft-button"
                        variant="outline"
                        loading={loadingAction === "refresh"}
                        onClick={() => {
                          void refreshDraftStatus(draftState.draft_run_id);
                        }}
                      >
                        <MdRefresh />
                        Refresh
                      </Button>
                    )}
                  </HStack>
                </Flex>
              </Box>

              {!draftState && (
                <Box
                  borderWidth="1px"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                  p={6}
                  bg="base.light"
                >
                  <Heading fontSize="title.md" fontWeight="semibold">
                    No draft has been started for this inventory.
                  </Heading>
                  <Text color="content.tertiary" mt={2}>
                    Starting a draft asks Climate Advisor to load the bounded CC
                    context and stage Stationary Energy proposals in the CA
                    database.
                  </Text>
                </Box>
              )}

              <VStack align="stretch" gap={3}>
                {draftState?.proposals.map((proposal) => {
                  const source = findRecommendedSource(
                    proposal,
                    draftState.source_candidates,
                  );
                  return (
                    <Box
                      key={proposal.proposal_id}
                      borderWidth="1px"
                      borderColor="border.neutral"
                      borderRadius="rounded"
                      p={4}
                      bg="base.light"
                    >
                      <Flex
                        justifyContent="space-between"
                        alignItems={{ base: "flex-start", md: "center" }}
                        flexDirection={{ base: "column", md: "row" }}
                        gap={3}
                      >
                        <Box>
                          <Heading fontSize="body.lg" fontWeight="semibold">
                            {proposalLabel(proposal)}
                          </Heading>
                          <Text color="content.tertiary" mt={1}>
                            Current: {currentValueLabel(proposal)}
                          </Text>
                        </Box>
                        <Badge>{proposal.status}</Badge>
                      </Flex>
                      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={4}>
                        <Box>
                          <Text color="content.tertiary" fontSize="label.md">
                            Draft value
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
                            {sourceLabel(source)}
                          </Text>
                        </Box>
                      </SimpleGrid>
                      <Text color="content.primary" mt={4}>
                        {proposal.rationale ?? "No rationale returned."}
                      </Text>
                    </Box>
                  );
                })}
              </VStack>
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
                Decision Rail
              </Heading>
              <Text color="content.tertiary" mt={2}>
                Confirm the draft is ready for row-level review before saving
                anything to CityCatalyst.
              </Text>

              <SimpleGrid columns={2} gap={3} mt={5}>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Proposals
                  </Text>
                  <Text fontSize="title.lg" fontWeight="semibold">
                    {draftState?.proposals.length ?? 0}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Sources
                  </Text>
                  <Text fontSize="title.lg" fontWeight="semibold">
                    {draftState?.source_candidates.length ?? 0}
                  </Text>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Ready
                  </Text>
                  <HStack gap={2}>
                    <MdCheckCircle />
                    <Text fontWeight="semibold">{summary.ready}</Text>
                  </HStack>
                </Box>
                <Box>
                  <Text color="content.tertiary" fontSize="label.md">
                    Conflicts and gaps
                  </Text>
                  <HStack gap={2}>
                    <MdErrorOutline />
                    <Text fontWeight="semibold">
                      {summary.conflict + summary.gap + summary.needsReview}
                    </Text>
                  </HStack>
                </Box>
              </SimpleGrid>

              <VStack align="stretch" gap={3} mt={6}>
                {draftState ? (
                  <NextLink href={reviewHref}>
                    <Button w="full">
                      Continue to review
                      <MdArrowForward />
                    </Button>
                  </NextLink>
                ) : (
                  <Button w="full" disabled>
                    Continue to review
                    <MdArrowForward />
                  </Button>
                )}
                <NextLink href={`/${lng}/GHGI/draft/stationary-energy`}>
                  <Button w="full" variant="outline">
                    Change city or inventory
                  </Button>
                </NextLink>
              </VStack>
            </Box>
          </SimpleGrid>
        )}
      </VStack>
    </Wrapper>
  );
}
