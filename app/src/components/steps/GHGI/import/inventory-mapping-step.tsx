"use client";

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
import { MdError, MdWarning } from "react-icons/md";
import { api } from "@/services/api";
import type { ColumnInfo, RequiredMappingOption } from "@/util/types";

const MANDATORY_KEYS = new Set(["gpcRefNo", "sector", "subsector", "activityAmount"]);

interface InventoryMappingStepProps {
  t: TFunction;
  cityId: string;
  cityName?: string;
  inventoryId: string;
  importedFileId: string;
  mappingOverrides: Record<string, string>;
  onMappingChange: (columnName: string, mappedKey: string) => void;
  canContinue: boolean;
}

export default function InventoryMappingStep({
  t,
  cityId,
  cityName,
  inventoryId,
  importedFileId,
  mappingOverrides,
  onMappingChange,
  canContinue,
}: InventoryMappingStepProps) {
  const { data, isLoading } = api.useGetImportStatusQuery(
    { cityId, inventoryId, importedFileId },
    { skip: !cityId || !inventoryId || !importedFileId },
  );

  const columns: ColumnInfo[] = data?.columnMappings?.columns || [];
  const requiredMappings: RequiredMappingOption[] =
    data?.columnMappings?.requiredMappings || [];

  const getKeyForLabel = (label: string | null): string => {
    if (!label) return "";
    return requiredMappings.find((r) => r.label === label)?.key ?? "";
  };

  const getEffectiveKey = (col: ColumnInfo): string => {
    if (col.columnName in mappingOverrides) return mappingOverrides[col.columnName];
    return getKeyForLabel(col.interpretedAs);
  };

  const isMandatoryColumn = (col: ColumnInfo): boolean => {
    const autoKey = getKeyForLabel(col.interpretedAs);
    const overrideKey = mappingOverrides[col.columnName] ?? "";
    return MANDATORY_KEYS.has(autoKey) || MANDATORY_KEYS.has(overrideKey);
  };

  const hasUnmappedColumns = columns.some((col) => getEffectiveKey(col) === "");

  const sortedColumns = [...columns].sort((a, b) => {
    const aReq = isMandatoryColumn(a) ? 0 : 1;
    const bReq = isMandatoryColumn(b) ? 0 : 1;
    return aReq - bReq;
  });

  if (isLoading) {
    return (
      <Box w="full">
        <Box display="flex" flexDir="column" gap="24px" mb={6}>
          {cityName && (
            <Text fontSize="body.md" color="content.tertiary" fontWeight="medium">
              {cityName}
            </Text>
          )}
          <Heading size="lg">{t("inventory-mapping-heading")}</Heading>
          <Text fontSize="body.lg" color="content.tertiary">
            {t("inventory-mapping-description")}
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
          <VStack gap="16px" py={12} alignItems="center" justifyContent="center">
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
        {cityName && (
          <Text fontSize="body.md" color="content.tertiary" fontWeight="medium">
            {cityName}
          </Text>
        )}
        <Heading size="lg">{t("inventory-mapping-heading")}</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("inventory-mapping-description")}
        </Text>
      </Box>

      {!canContinue && (
        <Box
          bg="sentiment.negativeOverlay"
          border="1px solid"
          borderColor="sentiment.negativeDefault"
          borderRadius="md"
          p={4}
          mb={6}
          display="flex"
          alignItems="flex-start"
          gap="12px"
        >
          <Icon
            as={MdError}
            boxSize={5}
            color="sentiment.negativeDefault"
            mt="2px"
            flexShrink={0}
          />
          <Box>
            <Text fontWeight="semibold" color="sentiment.negativeDefault" fontSize="body.md">
              {t("required-fields-not-mapped")}
            </Text>
            <Text fontSize="body.sm" color="content.secondary" mt={1}>
              {t("required-fields-not-mapped-description")}
            </Text>
          </Box>
        </Box>
      )}

      {canContinue && hasUnmappedColumns && (
        <Box
          bg="sentiment.warningOverlay"
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="md"
          p={4}
          mb={6}
          display="flex"
          alignItems="flex-start"
          gap="12px"
        >
          <Icon
            as={MdWarning}
            boxSize={5}
            color="sentiment.warningDefault"
            mt="2px"
            flexShrink={0}
          />
          <Box>
            <Text fontWeight="semibold" color="sentiment.warningDefault" fontSize="body.md">
              {t("some-columns-need-mapping")}
            </Text>
            <Text fontSize="body.sm" color="content.secondary" mt={1}>
              {t("some-columns-need-mapping-description")}
            </Text>
          </Box>
        </Box>
      )}

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
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("field-name")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("value")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("map-to")}</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sortedColumns.map((col, index) => {
              const effectiveKey = getEffectiveKey(col);
              const isMapped = effectiveKey !== "";
              const isMandatory = isMandatoryColumn(col);

              return (
                <Table.Row key={index}>
                  <Table.Cell>
                    <Text fontWeight="medium">
                      {col.columnName}
                      {isMandatory && (
                        <Text as="span" color="sentiment.negativeDefault" ml="2px">
                          {" *"}
                        </Text>
                      )}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text color="content.secondary">
                      {col.exampleValue || "-"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Box>
                      <NativeSelect.Root>
                        <NativeSelect.Field
                          value={effectiveKey}
                          onChange={(e) =>
                            onMappingChange(col.columnName, e.target.value)
                          }
                          borderColor={
                            !isMapped && isMandatory
                              ? "sentiment.negativeDefault"
                              : !isMapped
                                ? "sentiment.warningDefault"
                                : undefined
                          }
                        >
                          <option value="">{t("select-option-to-map")}</option>
                          {requiredMappings.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      {!isMapped && (
                        <Text
                          fontSize="body.sm"
                          color={
                            isMandatory
                              ? "sentiment.negativeDefault"
                              : "sentiment.warningDefault"
                          }
                          mt={1}
                        >
                          {t("needs-remapping")}
                        </Text>
                      )}
                    </Box>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Card.Root>
    </Box>
  );
}
