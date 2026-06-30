"use client";

import { useEffect } from "react";
import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Icon,
  NativeSelect,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MdCheck, MdWarning } from "react-icons/md";
import { api } from "@/services/api";
import type { ColumnInfo, RequiredMappingOption } from "@/util/types";

// A column's dropdown can be in one of three states. They look identical
// when empty, so we surface them visually (see getMappingState below).
type MappingState = "auto-mapped" | "user-mapped" | "unmapped";

// Target fields the importer requires (a GPC reference number, OR both sector
// and subsector — see ECRFImportService). Marked with * in the dropdowns.
const MANDATORY_KEYS = new Set(["gpcRefNo", "sector", "subsector"]);

interface MappingColumnsStepProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onContinue: () => void;
  mappingOverrides: Record<string, string>;
  onMappingChange: (columnName: string, mappedKey: string) => void;
  onValidityChange?: (canContinue: boolean) => void;
}

export default function MappingColumnsStep({
  t,
  cityId,
  inventoryId,
  importedFileId,
  onContinue,
  mappingOverrides,
  onMappingChange,
  onValidityChange,
}: MappingColumnsStepProps) {
  const { data, isLoading } = api.useGetImportStatusQuery(
    {
      cityId,
      inventoryId,
      importedFileId,
    },
    {
      skip: !cityId || !inventoryId || !importedFileId,
    },
  );

  const columns: ColumnInfo[] = data?.columnMappings?.columns || [];
  const requiredMappings: RequiredMappingOption[] =
    data?.columnMappings?.requiredMappings || [];

  const getKeyForLabel = (label: string | null): string => {
    if (!label) return "";
    const m = requiredMappings.find((r) => r.label === label);
    return m?.key ?? "";
  };

  // Effective mapping for a column: a user override wins over auto-detection.
  const getCurrentKey = (column: ColumnInfo): string => {
    const hasOverride = column.columnName in mappingOverrides;
    return hasOverride
      ? mappingOverrides[column.columnName]
      : getKeyForLabel(column.interpretedAs);
  };

  // Derive the tri-state from currentKey (more robust than column.status,
  // which can be "detected" while the label fails to resolve to a key).
  const getMappingState = (column: ColumnInfo): MappingState => {
    const hasOverride = column.columnName in mappingOverrides;
    if (getCurrentKey(column) === "") return "unmapped";
    if (hasOverride && mappingOverrides[column.columnName] !== "")
      return "user-mapped";
    return "auto-mapped";
  };

  const unmappedCount = columns.filter(
    (column) => getMappingState(column) === "unmapped",
  ).length;

  // The importer requires a GPC reference number, OR both sector and subsector
  // (see ECRFImportService); every other target field is optional. Gate the
  // step on that minimum so a valid-but-sparse file is never blocked.
  const mappedKeys = new Set(
    columns.map((column) => getCurrentKey(column)).filter((k) => k !== ""),
  );
  const requiredSatisfied =
    mappedKeys.has("gpcRefNo") ||
    (mappedKeys.has("sector") && mappedKeys.has("subsector"));

  useEffect(() => {
    onValidityChange?.(requiredSatisfied);
  }, [requiredSatisfied, onValidityChange]);

  const handleMappingChange = (columnName: string, value: string) => {
    onMappingChange(columnName, value);
  };

  if (isLoading) {
    return (
      <Box w="full">
        <Box display="flex" flexDir="column" gap="24px" mb={6}>
          <Heading size="lg">{t("map-rows-heading")}</Heading>
          <Text fontSize="body.lg" color="content.tertiary">
            {t("map-rows-description")}
          </Text>
        </Box>
        <Card.Root
          px={6}
          py={8}
          shadow="none"
          bg="white"
          w="full"
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border.default"
        >
          <VStack
            gap="16px"
            py={12}
            alignItems="center"
            justifyContent="center"
          >
            <Spinner size="lg" color="interactive.primary" />
            <Text fontSize="body.md" color="content.secondary">
              {t("loading-validation-results")}
            </Text>
          </VStack>
        </Card.Root>
      </Box>
    );
  }

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading size="lg">{t("map-rows-heading")}</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("map-rows-description")}
        </Text>
      </Box>

      <Card.Root
        px={6}
        py={8}
        shadow="none"
        bg="white"
        w="full"
        borderRadius="lg"
        borderWidth="1px"
        borderColor="border.default"
      >
        {!requiredSatisfied ? (
          <Box
            bg="sentiment.negativeOverlay"
            borderRadius="md"
            p={4}
            mb={6}
            display="flex"
            alignItems="center"
            gap="12px"
          >
            <Icon
              as={MdWarning}
              boxSize={5}
              color="sentiment.negativeDefault"
            />
            <Box>
              <Text fontWeight="medium" color="sentiment.negativeDefault">
                {t("required-mapping-missing-title")}
              </Text>
              <Text fontSize="body.sm" color="content.secondary">
                {t("required-mapping-missing")}
              </Text>
            </Box>
          </Box>
        ) : unmappedCount > 0 ? (
          <Box
            bg="sentiment.warningOverlay"
            borderRadius="md"
            p={4}
            mb={6}
            display="flex"
            alignItems="center"
            gap="12px"
          >
            <Icon as={MdWarning} boxSize={5} color="sentiment.warningDefault" />
            <Box>
              <Text fontWeight="medium" color="sentiment.warningDefault">
                {t("columns-need-mapping")}
              </Text>
              <Text fontSize="body.sm" color="content.secondary">
                {t("unmapped-count", {
                  count: unmappedCount,
                  total: columns.length,
                })}
              </Text>
            </Box>
          </Box>
        ) : null}
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("field-name")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("value")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("map-to")}</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {columns.map((column, index) => {
              const currentKey = getCurrentKey(column);
              const mappingState = getMappingState(column);
              const isUnmapped = mappingState === "unmapped";

              return (
                <Table.Row key={index}>
                  <Table.Cell>
                    <Text fontWeight="medium">{column.columnName}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text color="content.secondary">
                      {column.exampleValue || "-"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Box display="flex" flexDirection="column" gap="6px">
                      <NativeSelect.Root>
                        <NativeSelect.Field
                          value={currentKey}
                          borderColor={
                            isUnmapped ? "sentiment.warningDefault" : undefined
                          }
                          borderWidth={isUnmapped ? "1px" : undefined}
                          bg={
                            isUnmapped ? "sentiment.warningOverlay" : undefined
                          }
                          onChange={(e) =>
                            handleMappingChange(
                              column.columnName,
                              e.target.value,
                            )
                          }
                        >
                          <option value="">{t("select-mapping")}</option>
                          {requiredMappings.map((m) => (
                            <option key={m.key} value={m.key}>
                              {MANDATORY_KEYS.has(m.key)
                                ? `${m.label} *`
                                : m.label}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      {isUnmapped ? (
                        <Box display="flex" alignItems="center" gap="6px">
                          <Icon
                            as={MdWarning}
                            boxSize={4}
                            color="sentiment.warningDefault"
                          />
                          <Text
                            fontSize="body.sm"
                            color="sentiment.warningDefault"
                          >
                            {t("needs-mapping")}
                          </Text>
                        </Box>
                      ) : mappingState === "user-mapped" ? (
                        <Box display="flex" alignItems="center" gap="6px">
                          <Icon
                            as={MdCheck}
                            boxSize={4}
                            color="sentiment.positiveDefault"
                          />
                          <Text fontSize="body.sm" color="content.tertiary">
                            {t("mapped-by-you")}
                          </Text>
                        </Box>
                      ) : null}
                    </Box>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
        <Text fontSize="body.sm" color="content.secondary" mt={4}>
          {t("mandatory-legend")}
        </Text>
      </Card.Root>
    </Box>
  );
}
