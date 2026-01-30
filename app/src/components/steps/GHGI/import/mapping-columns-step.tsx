"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  NativeSelect,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { api } from "@/services/api";
import type { ColumnInfo, RequiredMappingOption } from "@/util/types";

interface MappingColumnsStepProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onContinue: () => void;
  mappingOverrides: Record<string, string>;
  onMappingChange: (columnName: string, mappedKey: string) => void;
}

export default function MappingColumnsStep({
  t,
  cityId,
  inventoryId,
  importedFileId,
  onContinue,
  mappingOverrides,
  onMappingChange,
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
              const hasOverride = column.columnName in mappingOverrides;
              const overrideKey = mappingOverrides[column.columnName];
              const detectedKey = getKeyForLabel(column.interpretedAs);
              const currentKey = hasOverride ? overrideKey : detectedKey;

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
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={currentKey}
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
                            {m.label}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
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
