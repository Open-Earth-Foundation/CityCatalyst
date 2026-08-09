"use client";

import type { ReactNode } from "react";

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
  LuRefreshCw,
} from "react-icons/lu";
import type { IconType } from "react-icons";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type { ConceptNoteRun } from "@/util/types";

import {
  conceptNoteResumeHref,
  formatRelativeTime,
  getRunStatusPresentation,
  humanizeLifecycleValue,
  type RunStatusTone,
} from "./utils";

interface ConceptNoteDashboardProps {
  cityId: string;
  lng: string;
}

interface ContextTileProps {
  detail: ReactNode;
  icon: IconType;
  label: string;
  status?: string;
  statusTone?: RunStatusTone;
  value: ReactNode;
}

interface RunCardProps {
  activityLabel: string;
  reducedMotion: boolean;
  resumeHref: string;
  resumeLabel: string;
  run: ConceptNoteRun;
  scopeLabel: string;
  statusLabel: string;
  statusTone: RunStatusTone;
}

const statusStyles: Record<
  RunStatusTone,
  { border?: string; color: string; surface: string }
> = {
  positive: {
    color: "sentiment.positiveDefault",
    surface: "sentiment.positiveOverlay",
  },
  warning: {
    color: "sentiment.warningDefault",
    surface: "sentiment.warningOverlay",
  },
  info: {
    color: "content.link",
    surface: "background.alternativeLight",
  },
  negative: {
    color: "sentiment.negativeDefault",
    surface: "sentiment.negativeOverlay",
  },
  neutral: {
    border: "border.neutral",
    color: "content.tertiary",
    surface: "background.backgroundLight",
  },
};

const runGridColumns = {
  base: "1fr",
  md: "repeat(2, minmax(0, 1fr))",
  xl: "repeat(3, minmax(0, 1fr))",
};

function StatusBadge({ label, tone }: { label: string; tone: RunStatusTone }) {
  const colors = statusStyles[tone];

  return (
    <HStack
      gap={1.5}
      border="1px solid"
      borderColor={colors.border ?? colors.color}
      borderRadius="pill"
      bg={colors.surface}
      px={2.5}
      py={1}
      width="fit-content"
    >
      <Box boxSize="6px" borderRadius="full" bg={colors.color} />
      <Text
        fontFamily="body"
        fontSize="label.sm"
        fontWeight="medium"
        lineHeight="16"
        color="content.secondary"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </HStack>
  );
}

function ContextTile({
  detail,
  icon,
  label,
  status,
  statusTone = "neutral",
  value,
}: ContextTileProps) {
  return (
    <VStack
      align="stretch"
      gap={2.5}
      minH="178px"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={3}
      boxShadow="1dp"
    >
      <Flex align="center" justify="space-between" gap={2}>
        <Text
          fontFamily="heading"
          fontSize="overline"
          fontWeight="semibold"
          letterSpacing="widest"
          color="content.tertiary"
          textTransform="uppercase"
        >
          {label}
        </Text>
        <Icon as={icon} boxSize={3.5} color="content.link" />
      </Flex>
      {status && <StatusBadge label={status} tone={statusTone} />}
      <Box
        fontFamily="heading"
        fontSize="title.sm"
        fontWeight="semibold"
        lineHeight="20"
        color="content.primary"
      >
        {value}
      </Box>
      <Box
        mt="auto"
        fontFamily="body"
        fontSize="label.sm"
        lineHeight="16"
        color="content.tertiary"
      >
        {detail}
      </Box>
    </VStack>
  );
}

function RunCard({
  activityLabel,
  reducedMotion,
  resumeHref,
  resumeLabel,
  run,
  scopeLabel,
  statusLabel,
  statusTone,
}: RunCardProps) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{ height: "100%" }}
    >
      <VStack
        as="article"
        data-testid={`concept-note-run-${run.run_id}`}
        align="stretch"
        gap={2.5}
        h="full"
        minH="178px"
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="rounded"
        bg="base.light"
        p={4}
        boxShadow="1dp"
        transition="border-color 160ms ease, box-shadow 160ms ease"
        _hover={{ borderColor: "background.overlay", boxShadow: "2dp" }}
        _motionReduce={{ transition: "none" }}
      >
        <Flex align="start" justify="space-between" gap={3}>
          <Heading
            as="h2"
            minW={0}
            fontFamily="heading"
            fontSize="title.sm"
            fontWeight="semibold"
            lineHeight="20"
            color="content.primary"
          >
            {run.name}
          </Heading>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </Flex>

        <Text
          fontFamily="body"
          fontSize="body.sm"
          lineHeight="16"
          color="content.tertiary"
        >
          {scopeLabel}
        </Text>

        <Box h="4px" borderRadius="pill" bg="background.neutral" />

        <Text
          fontFamily="body"
          fontSize="label.sm"
          lineHeight="16"
          color="content.tertiary"
        >
          {activityLabel}
        </Text>

        <HStack mt="auto">
          <Button asChild size="sm" variant="solid">
            <NextLink href={resumeHref}>{resumeLabel}</NextLink>
          </Button>
        </HStack>
      </VStack>
    </motion.div>
  );
}

function RunCardSkeleton() {
  return (
    <VStack
      align="stretch"
      gap={3}
      minH="178px"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={4}
    >
      <Flex justify="space-between" gap={4}>
        <Skeleton h="20px" w="58%" />
        <Skeleton h="24px" w="88px" borderRadius="pill" />
      </Flex>
      <Skeleton h="16px" w="76%" />
      <Skeleton h="4px" w="full" borderRadius="pill" />
      <Skeleton h="16px" w="52%" />
      <Skeleton mt="auto" h="32px" w="90px" borderRadius="pill" />
    </VStack>
  );
}

export function ConceptNoteDashboard({
  cityId,
  lng,
}: ConceptNoteDashboardProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const reducedMotion = useReducedMotion() ?? false;
  const {
    data: runList,
    isError: runsFailed,
    isLoading: runsLoading,
    refetch: refetchRuns,
  } = api.useGetConceptNoteRunsQuery(cityId);
  const { data: city, isLoading: cityLoading } = api.useGetCityQuery(cityId);
  const { data: population, isLoading: populationLoading } =
    api.useGetMostRecentCityPopulationQuery({ cityId });
  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryByCityIdQuery(cityId);
  const { data: files, isLoading: filesLoading } =
    api.useGetUserFilesQuery(cityId);

  const runs = runList?.runs ?? [];
  const cityFiles = files ?? [];
  const cityName = city?.name || t("selected-city");
  const cityLocation = city?.country
    ? t("city-location", { city: cityName, country: city.country })
    : cityName;
  const linkedFundingCount = runs.filter(
    (run) => run.funder_id !== null,
  ).length;
  const latestRunUpdate = runs[0]
    ? formatRelativeTime(runs[0].updated_at, lng)
    : "";
  const populationLabel = population
    ? t("population", {
        population: new Intl.NumberFormat(lng).format(population.population),
        year: population.year,
      })
    : t("population-unavailable");
  const inventoryLabel = inventory?.year
    ? t("inventory-year", { year: inventory.year })
    : t("no-inventory");
  const fundingContextLabel = linkedFundingCount
    ? t("funding-linked", { count: linkedFundingCount })
    : t("funding-not-selected");
  const runActivityLabel = latestRunUpdate
    ? t("latest-run-update", { time: latestRunUpdate })
    : t("no-run-activity");
  const fileName = cityFiles[0]?.fileName ?? t("no-city-files");
  const wiringHref = `/${lng}/cities/${cityId}/concept-notes/wiring`;

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
            <Button asChild size="sm" variant="solid">
              <NextLink href={wiringHref}>{t("new-concept-note")}</NextLink>
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
                lg: "repeat(4, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 205px)) minmax(260px, 1fr)",
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
                icon={LuLandmark}
                label={t("funding-context")}
                value={
                  runsLoading ? <Skeleton h="20px" /> : fundingContextLabel
                }
                detail={t("funding-detail")}
              />
              <ContextTile
                icon={LuFileText}
                label={t("run-activity")}
                value={
                  runsLoading ? (
                    <Skeleton h="20px" />
                  ) : (
                    t("run-count", { count: runs.length })
                  )
                }
                detail={runActivityLabel}
              />
              <ContextTile
                icon={LuFolderOpen}
                label={t("city-files")}
                value={filesLoading ? <Skeleton h="20px" /> : fileName}
                detail={t("file-count", { count: cityFiles.length })}
              />
            </Grid>
          </VStack>

          {runsFailed ? (
            <Flex
              align={{ base: "stretch", sm: "center" }}
              direction={{ base: "column", sm: "row" }}
              gap={4}
              border="1px solid"
              borderColor="sentiment.negativeDefault"
              borderRadius="rounded"
              bg="sentiment.negativeOverlay"
              p={5}
            >
              <Box flex={1}>
                <Heading
                  as="h2"
                  fontFamily="heading"
                  fontSize="title.sm"
                  color="content.primary"
                >
                  {t("load-error-title")}
                </Heading>
                <Text mt={1} fontSize="body.sm" color="content.secondary">
                  {t("load-error-description")}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetchRuns()}
              >
                <Icon as={LuRefreshCw} />
                {t("try-again")}
              </Button>
            </Flex>
          ) : runsLoading ? (
            <Grid gap={5} gridTemplateColumns={runGridColumns}>
              <RunCardSkeleton />
              <RunCardSkeleton />
              <RunCardSkeleton />
            </Grid>
          ) : runs.length ? (
            <Grid gap={5} gridTemplateColumns={runGridColumns}>
              {runs.map((run) => {
                const status = getRunStatusPresentation(run.status);
                const statusLabel = status.translationKey
                  ? t(status.translationKey)
                  : humanizeLifecycleValue(run.status);
                const workflowLabel = humanizeLifecycleValue(run.workflow_step);
                const updatedLabel =
                  formatRelativeTime(run.updated_at, lng) ||
                  t("updated-recently");
                const runFundingLabel = run.funder_id
                  ? t("funding-linked-short")
                  : t("funding-not-selected-short");

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
                    resumeHref={conceptNoteResumeHref(lng, cityId, run.run_id)}
                    resumeLabel={t("resume")}
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
              <Button asChild size="sm" variant="outline">
                <NextLink href={wiringHref}>
                  {t("create-first-note")}
                  <Icon as={LuArrowUpRight} />
                </NextLink>
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
    </Box>
  );
}
