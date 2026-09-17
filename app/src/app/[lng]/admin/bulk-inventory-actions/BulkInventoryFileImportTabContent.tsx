"use client";

import { toaster } from "@/components/ui/toaster";
import { api } from "@/services/api";
import {
  Box,
  Checkbox,
  Field,
  FieldRoot,
  Fieldset,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/custom-radio";
import CustomSelectableButton from "@/components/custom-selectable-buttons";
import {
  FileUploadDropzone,
  FileUploadList,
  FileUploadRoot,
} from "@/components/ui/file-upload";
import { Tag } from "@/components/ui/tag";
import { logger } from "@/services/logger";
import { InventoryTypeEnum } from "@/util/enums";

interface BulkInventoryFileImportTabContentProps {
  t: TFunction;
}

interface BulkFileImportInputs {
  projectId: string;
  year: number;
  inventoryType: string;
  gwp: string;
  createMissingCities: boolean;
  replaceExisting: boolean;
  dryRun: boolean;
  countryLocode: string;
}

const JOB_IN_PROGRESS = new Set(["pending", "matching", "importing"]);

const COUNT_LABEL_KEYS = {
  pending: "bulk-import-count-pending",
  importing: "bulk-import-count-importing",
  completed: "bulk-import-count-completed",
  failed: "bulk-import-count-failed",
  unmatched: "bulk-import-count-unmatched",
  skipped: "bulk-import-count-skipped",
} as const;

const JOB_STATUS_KEYS: Record<string, string> = {
  pending: "bulk-import-job-status-pending",
  matching: "bulk-import-job-status-matching",
  importing: "bulk-import-job-status-importing",
  completed: "bulk-import-job-status-completed",
  failed: "bulk-import-job-status-failed",
  cancelled: "bulk-import-job-status-cancelled",
};

const ITEM_STATUS_KEYS: Record<string, string> = {
  pending: "bulk-import-item-status-pending",
  matched: "bulk-import-item-status-matched",
  unmatched: "bulk-import-item-status-unmatched",
  importing: "bulk-import-item-status-importing",
  completed: "bulk-import-item-status-completed",
  failed: "bulk-import-item-status-failed",
  skipped: "bulk-import-item-status-skipped",
};

function statusPalette(status: string): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "unmatched") return "yellow";
  if (status === "skipped") return "blue";
  if (status === "importing") return "purple";
  return "gray";
}

const BulkInventoryFileImportTabContent: FC<
  BulkInventoryFileImportTabContentProps
> = ({ t }) => {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear + 1; year >= 2000; year -= 1) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  const { control, register, handleSubmit, watch, setValue } =
    useForm<BulkFileImportInputs>({
      defaultValues: {
        year: currentYear,
        inventoryType: InventoryTypeEnum.GPC_BASIC,
        gwp: "AR6",
        createMissingCities: false,
        replaceExisting: false,
        dryRun: false,
        countryLocode: "",
      },
    });

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [inventoryGoalValue, setInventoryGoalValue] = useState(
    InventoryTypeEnum.GPC_BASIC,
  );
  const [gwpValue, setGwpValue] = useState("AR6");

  const projectId = watch("projectId");
  const { data: projectsList } = api.useGetUserProjectsQuery({});
  const [enqueueImport, { isLoading: isEnqueueing }] =
    api.useEnqueueBulkInventoryImportMutation();

  const { data: latestJob } = api.useGetLatestBulkInventoryImportJobQuery(
    projectId,
    { skip: !projectId },
  );
  const activeJobId = submittedJobId ?? latestJob?.id ?? null;
  const [pollingInterval, setPollingInterval] = useState(0);
  const { data: job } = api.useGetBulkInventoryImportJobQuery(activeJobId!, {
    skip: !activeJobId,
    pollingInterval,
  });

  useEffect(() => {
    if (!activeJobId) {
      setPollingInterval(0);
      return;
    }
    if (
      job?.id !== activeJobId ||
      !job.status ||
      JOB_IN_PROGRESS.has(job.status)
    ) {
      setPollingInterval(5000);
      return;
    }
    setPollingInterval(0);
  }, [activeJobId, job?.id, job?.status]);

  const onSubmit = async (data: BulkFileImportInputs) => {
    if (!zipFile) {
      toaster.create({
        type: "error",
        description: t("bulk-inventory-file-import-file-required"),
      });
      return;
    }
    const formData = new FormData();
    formData.append("projectId", data.projectId);
    formData.append("year", String(data.year));
    formData.append("inventoryType", data.inventoryType);
    formData.append("gwp", data.gwp);
    formData.append("createMissingCities", String(data.createMissingCities));
    formData.append("replaceExisting", String(data.replaceExisting));
    formData.append("dryRun", String(data.dryRun));
    if (data.countryLocode?.trim()) {
      formData.append("countryLocode", data.countryLocode.trim().toUpperCase());
    }
    formData.append("file", zipFile);

    try {
      const result = await enqueueImport(formData).unwrap();
      setSubmittedJobId(result.jobId);
      toaster.create({
        type: "success",
        description: t("bulk-inventory-file-import-enqueued", {
          count: result.itemCount,
          unmatched: result.unmatchedCount,
        }),
      });
    } catch (err) {
      logger.error({ err }, "Bulk inventory file import enqueue failed");
      toaster.create({
        type: "error",
        description: t("bulk-inventory-file-import-enqueue-error"),
      });
    }
  };

  const counts = job?.counts;

  return (
    <Tabs.Content value="bulk-inventory-file-import" px="60px" py="24px">
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
          {t("bulk-inventory-file-import")}
        </Heading>
        <Text color="content.tertiary" fontSize="body.lg">
          {t("bulk-inventory-file-import-caption")}
        </Text>
      </Box>

      <Fieldset.Root size="lg" maxW="full" py="36px">
        <Fieldset.Content display="flex" flexDir="column" gap="36px">
          <FieldRoot>
            <Field.Label
              fontFamily="heading"
              fontWeight="medium"
              fontSize="body.md"
              mb="4px"
            >
              {t("project")}
            </Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                h="56px"
                boxShadow="1dp"
                {...register("projectId", {
                  required: t("bulk-inventory-file-import-project-required"),
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
            <Field.Label
              fontFamily="heading"
              fontWeight="medium"
              fontSize="body.md"
              mb="4px"
            >
              {t("bulk-inventory-file-import-country")}
            </Field.Label>
            <Input
              h="56px"
              boxShadow="1dp"
              maxLength={2}
              textTransform="uppercase"
              placeholder={t("bulk-inventory-file-import-country-placeholder")}
              {...register("countryLocode")}
            />
            <Field.HelperText color="content.tertiary">
              {t("bulk-inventory-file-import-country-help")}
            </Field.HelperText>
          </FieldRoot>

          <FieldRoot>
            <Field.Label
              fontFamily="heading"
              fontWeight="medium"
              fontSize="body.md"
              mb="4px"
            >
              {t("year")}
            </Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                h="56px"
                boxShadow="1dp"
                {...register("year", { valueAsNumber: true, required: true })}
              >
                {yearOptions.map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </FieldRoot>

          <Box>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontWeight="bold"
              mb="16px"
            >
              {t("reporting-level-heading")}
            </Text>
            <Controller
              name="inventoryType"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(e) => {
                    field.onChange(e.value);
                    setInventoryGoalValue(e.value || "");
                  }}
                >
                  <HStack gap="16px">
                    {[
                      InventoryTypeEnum.GPC_BASIC,
                      InventoryTypeEnum.GPC_BASIC_PLUS,
                    ].map((value) => (
                      <CustomSelectableButton
                        field={field}
                        key={value}
                        value={value}
                        inputValue={inventoryGoalValue}
                        inputValueFunction={setInventoryGoalValue}
                        t={t}
                      />
                    ))}
                  </HStack>
                </RadioGroup>
              )}
            />
          </Box>

          <Box>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontWeight="bold"
              mb="16px"
            >
              {t("gwp-heading")}
            </Text>
            <Controller
              name="gwp"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(e) => {
                    field.onChange(e.value);
                    setGwpValue(e.value || "");
                  }}
                >
                  <HStack gap="16px">
                    {["AR5", "AR6"].map((value) => (
                      <CustomSelectableButton
                        field={field}
                        key={value}
                        value={value}
                        inputValue={gwpValue}
                        inputValueFunction={setGwpValue}
                        t={t}
                      />
                    ))}
                  </HStack>
                </RadioGroup>
              )}
            />
          </Box>

          <FieldRoot>
            <Field.Label
              fontFamily="heading"
              fontWeight="medium"
              fontSize="body.md"
              mb="8px"
            >
              {t("bulk-inventory-file-import-zip")}
            </Field.Label>
            <FileUploadRoot
              maxFiles={1}
              accept={{ "application/zip": [".zip"] }}
              onFileChange={(details) => {
                setZipFile(details.acceptedFiles[0] ?? null);
              }}
            >
              <FileUploadDropzone
                label={
                  <Box
                    border="1px dashed"
                    borderColor="border.neutral"
                    borderRadius="md"
                    px={6}
                    py={8}
                    w="full"
                  >
                    <Text color="content.secondary">
                      {t("bulk-inventory-file-import-dropzone")}
                    </Text>
                  </Box>
                }
                description={t("bulk-inventory-file-import-dropzone-caption")}
              />
              <FileUploadList clearable showSize />
            </FileUploadRoot>
          </FieldRoot>

          <Box display="flex" flexDir="column" gap="12px">
            <Checkbox.Root
              checked={watch("createMissingCities")}
              onCheckedChange={(e) =>
                setValue("createMissingCities", Boolean(e.checked))
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label fontSize="body.lg" color="content.secondary">
                {t("bulk-inventory-file-import-create-missing")}
              </Checkbox.Label>
            </Checkbox.Root>
            <Checkbox.Root
              checked={watch("replaceExisting")}
              onCheckedChange={(e) =>
                setValue("replaceExisting", Boolean(e.checked))
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label fontSize="body.lg" color="content.secondary">
                {t("bulk-inventory-file-import-replace-existing")}
              </Checkbox.Label>
            </Checkbox.Root>
            <Checkbox.Root
              checked={watch("dryRun")}
              onCheckedChange={(e) => setValue("dryRun", Boolean(e.checked))}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label fontSize="body.lg" color="content.secondary">
                {t("bulk-inventory-file-import-dry-run")}
              </Checkbox.Label>
            </Checkbox.Root>
          </Box>
        </Fieldset.Content>

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
            loading={isEnqueueing}
            p="32px"
            disabled={!zipFile}
            onClick={handleSubmit(onSubmit)}
          >
            {t("bulk-inventory-file-import-start")}
          </Button>
        </Box>
      </Fieldset.Root>

      {job && (
        <Box mt="48px">
          <Heading fontSize="title.md" mb={4} color="content.secondary">
            {t("bulk-inventory-file-import-progress")}
          </Heading>
          <HStack gap="8px" flexWrap="wrap" mb={4}>
            <Tag size="lg" colorPalette={statusPalette(job.status)}>
              {t(JOB_STATUS_KEYS[job.status] ?? JOB_STATUS_KEYS.pending)}
            </Tag>
            {job.dryRun && (
              <Tag size="lg" colorPalette="blue">
                {t("bulk-inventory-file-import-dry-run")}
              </Tag>
            )}
          </HStack>
          {counts && (
            <HStack gap="12px" flexWrap="wrap" mb={6}>
              {Object.entries(COUNT_LABEL_KEYS).map(([key, labelKey]) => (
                <Text key={key} fontSize="body.md" color="content.secondary">
                  {t(labelKey)}: {counts[key as keyof typeof COUNT_LABEL_KEYS]}
                </Text>
              ))}
            </HStack>
          )}
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>
                  {t("bulk-import-column-filename")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("bulk-import-column-locode")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("bulk-import-column-status")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("bulk-import-column-error")}
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {job.items?.map((item) => (
                <Table.Row key={item.id}>
                  <Table.Cell>{item.originalFileName}</Table.Cell>
                  <Table.Cell>{item.locode || t("not-available")}</Table.Cell>
                  <Table.Cell>
                    <Tag size="md" colorPalette={statusPalette(item.status)}>
                      {t(
                        ITEM_STATUS_KEYS[item.status] ??
                          ITEM_STATUS_KEYS.pending,
                      )}
                    </Tag>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="body.sm" color="content.tertiary">
                      {item.errorLog ?? item.errorCode ?? ""}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Tabs.Content>
  );
};

export default BulkInventoryFileImportTabContent;
