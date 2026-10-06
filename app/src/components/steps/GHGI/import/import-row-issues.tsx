"use client";

import { useState } from "react";
import { TFunction } from "i18next";
import { Box, Card, Icon, Spinner, Table, Text } from "@chakra-ui/react";
import { MdCheckCircle, MdError, MdWarning } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { ImportRowOutcome } from "@/util/types";

const COLLAPSED_ROW_LIMIT = 10;

interface ImportRowIssuesProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  mappingOverrides: Record<string, string>;
}

function rowSource(row: ImportRowOutcome, t: TFunction): string {
  return row.gpcRefNo ?? row.sourceLabel ?? t("import-row-no-reference");
}

/**
 * Lists the uploaded rows that will be skipped on import, or imported without
 * counting toward completion, with the reason for each. Recomputed whenever
 * the column mapping changes.
 */
export default function ImportRowIssues({
  t,
  cityId,
  inventoryId,
  importedFileId,
  mappingOverrides,
}: ImportRowIssuesProps) {
  const [showAll, setShowAll] = useState(false);
  const overridesToSend = Object.fromEntries(
    Object.entries(mappingOverrides).filter(([, key]) => key !== ""),
  );
  const { data, isFetching, isError } = api.useGetImportRowPreviewQuery({
    cityId,
    inventoryId,
    importedFileId,
    mappingOverrides: overridesToSend,
  });

  if (isError) {
    return null;
  }
  if (!data) {
    return (
      <Box display="flex" alignItems="center" gap="8px" mb={6}>
        <Spinner size="sm" color="interactive.primary" />
        <Text fontSize="body.sm" color="content.secondary">
          {t("import-rows-checking")}
        </Text>
      </Box>
    );
  }

  if (data.rows.length === 0) {
    return (
      <Box display="flex" alignItems="center" gap="8px" mb={6}>
        <Icon
          as={MdCheckCircle}
          boxSize={5}
          color="sentiment.positiveDefault"
        />
        <Text fontSize="body.md" color="content.secondary">
          {t("import-rows-all-ok", { count: data.importedRows })}
        </Text>
      </Box>
    );
  }

  const notCounted = data.rows.filter((row) => row.status === "not-counted");
  const visibleRows = showAll
    ? data.rows
    : data.rows.slice(0, COLLAPSED_ROW_LIMIT);

  return (
    <Card.Root
      mb={6}
      shadow="none"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
      opacity={isFetching ? 0.6 : 1}
      data-testid="import-row-issues"
    >
      <Box display="flex" alignItems="flex-start" gap="12px" p={4}>
        <Icon
          as={data.skippedRows > 0 ? MdError : MdWarning}
          boxSize={5}
          color={
            data.skippedRows > 0
              ? "sentiment.negativeDefault"
              : "sentiment.warningDefault"
          }
          mt="2px"
          flexShrink={0}
        />
        <Box>
          <Text fontWeight="semibold" fontSize="body.md">
            {t("import-rows-summary", {
              imported: data.importedRows,
              total: data.totalRows,
            })}
          </Text>
          <Text fontSize="body.sm" color="content.secondary" mt={1}>
            {data.skippedRows > 0 &&
              t("import-rows-skipped", { count: data.skippedRows })}{" "}
            {notCounted.length > 0 &&
              t("import-rows-not-counted", { count: notCounted.length })}
          </Text>
        </Box>
      </Box>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("import-row-number")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("import-row-source")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("import-row-status")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("import-row-reason")}</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {visibleRows.map((row) => (
            <Table.Row key={`${row.rowNumber}-${row.issue}`}>
              <Table.Cell>{row.rowNumber}</Table.Cell>
              <Table.Cell>
                <Text fontWeight="medium">{rowSource(row, t)}</Text>
              </Table.Cell>
              <Table.Cell>
                <Text
                  fontWeight="medium"
                  color={
                    row.status === "skipped"
                      ? "sentiment.negativeDefault"
                      : "sentiment.warningDefault"
                  }
                >
                  {t(`import-row-status-${row.status}`)}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text color="content.secondary">
                  {t(`import-row-issue-${row.issue}`, {
                    notationKey: row.notationKey,
                  })}
                </Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {data.rows.length > COLLAPSED_ROW_LIMIT && (
        <Box p={3}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? t("import-rows-show-less")
              : t("import-rows-show-all", { count: data.rows.length })}
          </Button>
        </Box>
      )}
    </Card.Root>
  );
}
