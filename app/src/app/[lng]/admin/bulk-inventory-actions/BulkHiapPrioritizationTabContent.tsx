import { toaster } from "@/components/ui/toaster";
import {
  Box,
  Field,
  FieldRoot,
  Fieldset,
  Heading,
  NativeSelect,
  Table,
  VStack,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { logger } from "@/services/logger";
import { BodyLarge, BodyMedium, BodySmall } from "@/components/Texts/Body";
import { LabelMedium } from "@/components/Texts/Label";
import {
  api,
  useGetHiapJobsQuery,
  useMigrateHiapSelectionsMutation,
  useStartBulkHiapPrioritizationMutation,
} from "@/services/api";
import { ACTION_TYPES, HighImpactActionRankingStatus } from "@/util/types";

interface BulkHiapPrioritizationTabContentProps {
  t: TFunction;
  lng: string;
}

export interface BulkHiapPrioritizationInputs {
  projectId: string;
  year: number;
  actionType: ACTION_TYPES;
}

const BulkHiapPrioritizationTabContent: FC<
  BulkHiapPrioritizationTabContentProps
> = ({ t, lng }) => {
  const { register, handleSubmit, reset, watch } =
    useForm<BulkHiapPrioritizationInputs>({
      defaultValues: {
        year: new Date().getFullYear(),
        actionType: ACTION_TYPES.Mitigation,
      },
    });

  const { data: projectsList, isLoading: isProjectListLoading } =
    api.useGetUserProjectsQuery({});
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<{
    startedCount: number;
    failedCount: number;
    results: Array<{
      cityId: string;
      cityName: string;
      inventoryId: string;
      status: HighImpactActionRankingStatus;
      taskId?: string;
      error?: string;
    }>;
  } | null>(null);
  const selectedProjectId = watch("projectId");
  const selectedYear = watch("year");
  const selectedActionType = watch("actionType");

  // Check if all required fields are complete for fetching
  const isFormComplete = Boolean(
    selectedProjectId &&
      selectedYear &&
      selectedActionType &&
      selectedProjectId.trim() !== "" &&
      selectedYear > 0 &&
      selectedActionType.trim() !== "",
  );

  const {
    data: hiapJobs = [],
    isLoading: isLoadingJobs,
    error: hiapJobsError,
  } = useGetHiapJobsQuery(
    {
      projectId: selectedProjectId,
      year: selectedYear,
      actionType: selectedActionType,
    },
    {
      skip: !isFormComplete,
    },
  );

  // Handle HIAP jobs error
  if (hiapJobsError && isFormComplete) {
    logger.error(`Error fetching HIAP jobs: ${JSON.stringify(hiapJobsError)}`);
  }

  // Migration mutation hook
  const [migrateHiapSelections, { isLoading: isMigrating }] =
    useMigrateHiapSelectionsMutation();

  // Bulk prioritization mutation hook
  const [startBulkHiapPrioritization, { isLoading: isBulkProcessing }] =
    useStartBulkHiapPrioritizationMutation();

  const showToast = (
    title: string,
    description: string,
    status: string,
    duration: number | null,
  ) => {
    if (duration == null) {
      toaster.dismiss();
    }

    toaster.create({
      title: t(title),
      description: t(description),
      type: status,
      duration: duration!,
    });
  };

  const onSubmit = async (data: BulkHiapPrioritizationInputs) => {
    showToast(
      "starting-bulk-prioritization",
      "processing-cities",
      "info",
      null,
    );
    setErrorMessage("");
    setResults(null);

    try {
      const result = await startBulkHiapPrioritization({
        projectId: data.projectId,
        year: data.year,
        actionType: data.actionType,
        language: lng,
      }).unwrap();
      setResults(result);

      if (result.startedCount === 0) {
        // No inventories found for the specified year - this is not an error
        showToast(
          "no-inventories-found",
          "no-inventories-for-year",
          "info",
          5000,
        );
      } else if (result.failedCount > 0) {
        showToast(
          "bulk-prioritization-partial-success",
          "some-cities-failed",
          "warning",
          5000,
        );
      } else {
        showToast(
          "bulk-prioritization-complete",
          "all-cities-started",
          "success",
          5000,
        );
      }
    } catch (error) {
      logger.error(`Failed to start bulk HIAP prioritization: ${error}`);
      setErrorMessage("Network error occurred. Please try again.");
      showToast(
        "bulk-prioritization-failed",
        "bulk-prioritization-error",
        "error",
        null,
      );
    }
  };

  const handleMigrateSelections = async () => {
    if (!selectedProjectId) {
      showToast(
        "migration-failed",
        "please-select-project-first",
        "error",
        null,
      );
      return;
    }

    showToast("migration-started", "starting-migration", "info", null);

    try {
      const result = await migrateHiapSelections({
        projectId: selectedProjectId,
        year: selectedYear,
      }).unwrap();

      showToast(
        "migration-completed",
        `${result.message}. ${t("cities-processed")}: ${result.citiesProcessed}`,
        "success",
        null,
      );
    } catch (error) {
      logger.error(`Migration failed: ${error}`);
      showToast(
        "migration-failed",
        "migration-failed-try-again",
        "error",
        null,
      );
    }
  };

  return (
    <Box px="60px" py="24px">
      <Box>
        <Heading
          fontSize="title.md"
          mb={2}
          fontWeight="semibold"
          lineHeight="32px"
          fontStyle="normal"
          textTransform="initial"
          color="content.secondary"
        >
          {t("bulk-hiap-prioritization")}
        </Heading>
        <BodyLarge>{t("bulk-hiap-prioritization-caption")}</BodyLarge>
      </Box>
      <Box>
        <Fieldset.Root size="lg" maxW="full" py="36px">
          <Fieldset.Content display="flex" flexDir="column" gap="36px">
            <FieldRoot>
              <LabelMedium mb="4px">{t("project")}</LabelMedium>
              <NativeSelect.Root>
                <NativeSelect.Field
                  h="56px"
                  boxShadow="1dp"
                  {...register("projectId", {
                    required: t("project-required"),
                  })}
                >
                  <option value="">{t("select-project")}</option>
                  {projectsList?.map((project) => (
                    <option value={project.projectId} key={project.projectId}>
                      {project.name}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </FieldRoot>

            <FieldRoot>
              <LabelMedium mb="4px">{t("year")}</LabelMedium>
              <NativeSelect.Root>
                <NativeSelect.Field
                  h="56px"
                  boxShadow="1dp"
                  {...register("year", {
                    required: t("year-required"),
                    valueAsNumber: true,
                  })}
                >
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option value={year} key={year}>
                        {year}
                      </option>
                    );
                  })}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </FieldRoot>

            <FieldRoot>
              <LabelMedium mb="4px">{t("action-type")}</LabelMedium>
              <NativeSelect.Root>
                <NativeSelect.Field
                  h="56px"
                  boxShadow="1dp"
                  {...register("actionType", {
                    required: t("action-type-required"),
                  })}
                >
                  <option value={ACTION_TYPES.Mitigation}>
                    {t("mitigation")}
                  </option>
                  <option value={ACTION_TYPES.Adaptation}>
                    {t("adaptation")}
                  </option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </FieldRoot>
          </Fieldset.Content>

          <BodyMedium color="semantic.danger">{errorMessage}</BodyMedium>

          {/* HIAP Jobs Table */}
          {isFormComplete && (
            <Box mt="32px">
              <Heading
                fontSize="title.sm"
                mb="16px"
                fontWeight="semibold"
                color="content.secondary"
              >
                {t("hiap-prioritization-jobs")}
              </Heading>

              {isLoadingJobs ? (
                <BodyMedium color="content.tertiary">
                  {t("loading-jobs")}...
                </BodyMedium>
              ) : hiapJobsError ? (
                <BodyMedium color="semantic.danger">
                  {t("error-loading-jobs")}:{" "}
                  {hiapJobsError?.toString() || t("unknown-error")}
                </BodyMedium>
              ) : hiapJobs.length === 0 ? (
                <BodyMedium color="content.tertiary">
                  {t("no-hiap-jobs-found")}
                </BodyMedium>
              ) : (
                <Box overflowX="auto">
                  <Table.Root size="sm">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>
                          {t("city-name")}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>{t("job-id")}</Table.ColumnHeader>
                        <Table.ColumnHeader>{t("status")}</Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("created-at")}
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {hiapJobs.map((job) => (
                        <Table.Row
                          key={`${job.cityId}-${job.inventoryId}-${job.actionType}`}
                        >
                          <Table.Cell>
                            <BodyMedium fontWeight="medium">
                              {job.cityName}
                            </BodyMedium>
                          </Table.Cell>
                          <Table.Cell>
                            <BodySmall
                              fontFamily="mono"
                              fontSize="xs"
                              color="content.tertiary"
                            >
                              {job.taskId}
                            </BodySmall>
                          </Table.Cell>
                          <Table.Cell>
                            <BodyMedium>{job.status}</BodyMedium>
                          </Table.Cell>
                          <Table.Cell>
                            <BodySmall color="content.tertiary">
                              {new Date(job.createdAt).toLocaleDateString()}
                            </BodySmall>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}
            </Box>
          )}

          <Box
            display="flex"
            alignItems="center"
            mt="48px"
            w="full"
            gap="24px"
            justifyContent="right"
          >
            <Button
              type="submit"
              alignSelf="flex-start"
              loading={isBulkProcessing || isLoadingJobs}
              p="32px"
              onClick={handleSubmit(onSubmit)}
              disabled={!selectedProjectId || isLoadingJobs}
            >
              {t("start-bulk-prioritization")}
            </Button>
            <VStack>
              <Button
                variant="outline"
                alignSelf="flex-start"
                loading={isMigrating}
                p="32px"
                onClick={handleMigrateSelections}
                disabled={!selectedProjectId || isMigrating}
              >
                {t("migrate-hiap-selections")}
              </Button>
              <BodySmall color="content.tertiary" mt="8px">
                {t("migrate-hiap-selections-caption")}
              </BodySmall>
            </VStack>
          </Box>
        </Fieldset.Root>
      </Box>
    </Box>
  );
};

export default BulkHiapPrioritizationTabContent;
