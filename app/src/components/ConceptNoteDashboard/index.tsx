"use client";

import { useRef, useState } from "react";

import {
  Box,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { motion, useReducedMotion } from "framer-motion";
import NextLink from "next/link";
import {
  LuArrowUpRight,
  LuBuilding2,
  LuCheck,
  LuDatabase,
  LuFileText,
  LuFolderOpen,
  LuLandmark,
  LuListChecks,
  LuShieldAlert,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { toaster } from "@/components/ui/toaster";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import type { ConceptNoteRun } from "@/util/types";

import { ContextTile } from "./context-tile";
import {
  ConceptNoteLifecycleDialog,
  type ConceptNoteLifecycleAction,
} from "./lifecycle-dialog";
import { NewConceptNoteDialog } from "./new-concept-note-dialog";
import { RunCard } from "./run-card";
import { RunCardSkeleton } from "./run-card-skeleton";
import { StatusBadge } from "./status-badge";
import {
  conceptNoteResumeHref,
  formatRelativeTime,
  getRunProgressPercent,
  getRunStatusPresentation,
  getWorkflowStepTranslationKey,
} from "./utils";

interface ConceptNoteDashboardProps {
  cityId: string;
  lng: string;
}

const runGridColumns = {
  base: "1fr",
  md: "repeat(2, minmax(0, 1fr))",
  xl: "repeat(3, minmax(0, 1fr))",
};

export function ConceptNoteDashboard({
  cityId,
  lng,
}: ConceptNoteDashboardProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const reducedMotion = useReducedMotion() ?? false;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    action: ConceptNoteLifecycleAction;
    run: ConceptNoteRun;
  } | null>(null);
  const [duplicatingRunId, setDuplicatingRunId] = useState<string | null>(null);
  const duplicateKeysRef = useRef(new Map<string, string>());
  const [duplicateConceptNote] = api.useDuplicateConceptNoteRunMutation();
  const {
    data: runList,
    isError: runsFailed,
    isLoading: runsLoading,
  } = api.useGetConceptNoteRunsQuery(cityId);
  const { data: city, isLoading: cityLoading } = api.useGetCityQuery(cityId);
  const { data: population, isLoading: populationLoading } =
    api.useGetMostRecentCityPopulationQuery({ cityId });
  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryByCityIdQuery(cityId);
  const { data: files, isLoading: filesLoading } =
    api.useGetUserFilesQuery(cityId);
  const { data: cityDashboard, isLoading: modulesLoading } =
    api.useGetCityDashboardQuery({ cityId, lng });

  const runs = runList?.runs ?? [];
  const cityFiles = files ?? [];
  const cityName = city?.name || t("selected-city");
  const cityLocation = city?.country
    ? t("city-location", { city: cityName, country: city.country })
    : cityName;
  const populationLabel = population
    ? t("population", {
        population: new Intl.NumberFormat(lng).format(population.population),
        year: population.year,
      })
    : t("population-unavailable");
  const inventoryLabel = inventory?.year
    ? t("inventory-year", { year: inventory.year })
    : t("no-inventory");
  const fileName = cityFiles[0]?.fileName ?? t("no-city-files");
  const ccraConnected = Boolean(cityDashboard?.widgets.ccra);
  const hiapConnected = Boolean(cityDashboard?.widgets.hiap);

  async function duplicateRun(run: ConceptNoteRun): Promise<void> {
    const idempotencyKey =
      duplicateKeysRef.current.get(run.run_id) ?? crypto.randomUUID();
    duplicateKeysRef.current.set(run.run_id, idempotencyKey);
    setDuplicatingRunId(run.run_id);
    try {
      await duplicateConceptNote({
        cityId,
        idempotencyKey,
        runId: run.run_id,
      }).unwrap();
      duplicateKeysRef.current.delete(run.run_id);
      toaster.create({
        title: t("duplicate-success"),
        description: t("duplicate-success-description"),
        type: "success",
        meta: { closable: true },
      });
    } catch (error) {
      toaster.create({
        title:
          isFetchBaseQueryError(error) && error.status === 409
            ? t("duplicate-conflict")
            : t("duplicate-error"),
        description: t("lifecycle-retry-description"),
        type: "error",
        meta: { closable: true },
      });
    } finally {
      setDuplicatingRunId(null);
    }
  }

  return (
    <Box minH="calc(100vh - 80px)" bg="background.alternativeLight">
      <motion.main
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <VStack
          align="stretch"
          gap={5}
          maxW="1480px"
          mx="auto"
          px={{ base: 4, md: 10 }}
          pt={7}
          pb={12}
        >
          <Flex
            align={{ base: "stretch", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
            <Box>
              <Heading
                as="h1"
                fontFamily="heading"
                fontSize="title.lg"
                fontWeight="semibold"
                lineHeight="28"
                color="content.primary"
              >
                {t("title")}
              </Heading>
              <Text
                mt={0.5}
                fontFamily="body"
                fontSize="body.sm"
                lineHeight="16"
                color="content.tertiary"
              >
                {t("description")}
              </Text>
            </Box>
            <Flex flex={1} />
            <Button
              size="sm"
              variant="solid"
              onClick={() => setCreateDialogOpen(true)}
            >
              {t("new-concept-note")}
            </Button>
          </Flex>

          <VStack
            align="stretch"
            gap={4}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            bg="background.alternativeLight"
            px={5}
            py={4}
          >
            <Flex
              align={{ base: "start", md: "center" }}
              direction={{ base: "column", md: "row" }}
              gap={3}
            >
              <Flex align="center" gap={3} flex={1}>
                <Flex
                  boxSize="32px"
                  align="center"
                  justify="center"
                  borderRadius="rounded"
                  bg="content.alternative"
                  color="base.light"
                >
                  <Icon as={LuDatabase} boxSize={3.5} />
                </Flex>
                <Box>
                  <Text
                    fontFamily="heading"
                    fontSize="body.sm"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("context-title", { city: cityName })}
                  </Text>
                  <Text
                    fontFamily="body"
                    fontSize="label.sm"
                    color="content.tertiary"
                  >
                    {t("context-description")}
                  </Text>
                </Box>
              </Flex>
              <StatusBadge label={t("connected")} tone="positive" />
              <Button asChild size="sm" variant="outline">
                <NextLink href={`/${lng}/cities/${cityId}/dashboard`}>
                  {t("open-city-dashboard")}
                </NextLink>
              </Button>
            </Flex>

            <Grid
              gap={4}
              gridTemplateColumns={{
                base: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(5, minmax(0, 1fr))",
              }}
            >
              <ContextTile
                icon={LuBuilding2}
                label={t("city-context")}
                value={cityLoading ? <Skeleton h="20px" /> : cityLocation}
                detail={
                  populationLoading ? <Skeleton h="16px" /> : populationLabel
                }
              />
              <ContextTile
                icon={LuLandmark}
                label={t("ghg-inventory")}
                status={inventory ? t("connected") : t("not-available")}
                statusTone={inventory ? "info" : "neutral"}
                value={
                  inventoryLoading ? <Skeleton h="20px" /> : inventoryLabel
                }
                detail={t("inventory-detail")}
              />
              <ContextTile
                icon={LuShieldAlert}
                label={t("climate-risk-assessment")}
                status={ccraConnected ? t("connected") : t("not-available")}
                statusTone={ccraConnected ? "info" : "neutral"}
                value={
                  modulesLoading ? (
                    <Skeleton h="20px" />
                  ) : ccraConnected ? (
                    t("context-ready")
                  ) : (
                    t("not-available")
                  )
                }
                detail={t("ccra-detail")}
              />
              <ContextTile
                icon={LuListChecks}
                label={t("hiap-context")}
                status={hiapConnected ? t("connected") : t("not-available")}
                statusTone={hiapConnected ? "info" : "neutral"}
                value={
                  modulesLoading ? (
                    <Skeleton h="20px" />
                  ) : hiapConnected ? (
                    t("context-ready")
                  ) : (
                    t("not-available")
                  )
                }
                detail={t("hiap-detail")}
              />
              <ContextTile
                icon={LuFolderOpen}
                label={t("city-files")}
                value={filesLoading ? <Skeleton h="20px" /> : fileName}
                detail={t("file-count", { count: cityFiles.length })}
              />
            </Grid>
          </VStack>

          {runsFailed ? null : runsLoading ? (
            <Grid gap={5} gridTemplateColumns={runGridColumns}>
              <RunCardSkeleton />
              <RunCardSkeleton />
              <RunCardSkeleton />
            </Grid>
          ) : runs.length ? (
            <Grid gap={5} gridTemplateColumns={runGridColumns}>
              {runs.map((run) => {
                const status = getRunStatusPresentation(run.status);
                const statusLabel = t(status.translationKey);
                const workflowLabel = t(
                  getWorkflowStepTranslationKey(run.workflow_step),
                );
                const updatedLabel =
                  formatRelativeTime(run.updated_at, lng) ||
                  t("updated-recently");
                const runFundingLabel = run.funder_id
                  ? t("funding-linked-short")
                  : t("funding-not-selected-short");

                const progress = getRunProgressPercent(
                  run.status,
                  run.workflow_step,
                  run.progress_summary,
                );

                return (
                  <RunCard
                    key={run.run_id}
                    run={run}
                    reducedMotion={reducedMotion}
                    statusLabel={statusLabel}
                    statusTone={status.tone}
                    scopeLabel={t("run-scope", {
                      city: cityName,
                      funding: runFundingLabel,
                    })}
                    activityLabel={t("run-updated", {
                      workflow: workflowLabel,
                      time: updatedLabel,
                    })}
                    progressLabel={t("run-progress", { progress })}
                    progress={progress}
                    resumeHref={conceptNoteResumeHref(lng, cityId, run.run_id)}
                    resumeLabel={t("resume")}
                    renameLabel={t("rename")}
                    duplicateLabel={t("duplicate")}
                    deleteLabel={t("delete")}
                    duplicateLoading={duplicatingRunId === run.run_id}
                    lifecycleDisabled={Boolean(duplicatingRunId)}
                    onRename={() =>
                      setLifecycleDialog({ action: "rename", run })
                    }
                    onDuplicate={() => void duplicateRun(run)}
                    onDelete={() =>
                      setLifecycleDialog({ action: "delete", run })
                    }
                  />
                );
              })}
            </Grid>
          ) : (
            <Flex
              align={{ base: "start", sm: "center" }}
              direction={{ base: "column", sm: "row" }}
              gap={4}
              minH="170px"
              border="1px dashed"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              p={6}
            >
              <Flex
                boxSize="44px"
                align="center"
                justify="center"
                borderRadius="rounded"
                bg="background.neutral"
                color="content.link"
              >
                <Icon as={LuFileText} boxSize={5} />
              </Flex>
              <Box flex={1}>
                <Heading
                  as="h2"
                  fontFamily="heading"
                  fontSize="title.sm"
                  color="content.primary"
                >
                  {t("empty-title")}
                </Heading>
                <Text mt={1} fontSize="body.sm" color="content.tertiary">
                  {t("empty-description")}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateDialogOpen(true)}
              >
                {t("create-first-note")}
                <Icon as={LuArrowUpRight} />
              </Button>
            </Flex>
          )}

          {!runsLoading && !runsFailed && runs.length > 0 && (
            <HStack gap={2} color="content.tertiary">
              <Icon as={LuCheck} boxSize={3.5} />
              <Text fontSize="label.sm">{t("ordered-by-recent-activity")}</Text>
            </HStack>
          )}
        </VStack>
      </motion.main>
      <NewConceptNoteDialog
        cityId={cityId}
        cityName={cityName}
        lng={lng}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={city?.projectId ?? null}
        projectName={city?.project?.name ?? null}
      />
      {lifecycleDialog && (
        <ConceptNoteLifecycleDialog
          key={`${lifecycleDialog.action}-${lifecycleDialog.run.run_id}`}
          action={lifecycleDialog.action}
          cityId={cityId}
          lng={lng}
          run={lifecycleDialog.run}
          onClose={() => setLifecycleDialog(null)}
        />
      )}
    </Box>
  );
}
