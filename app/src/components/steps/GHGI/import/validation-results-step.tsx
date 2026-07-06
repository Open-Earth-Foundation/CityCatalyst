"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Icon,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MdCheck } from "react-icons/md";
import { api } from "@/services/api";
import { ColumnInfo } from "@/util/types";

interface ValidationResultsStepProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onContinue: () => void;
}

export default function ValidationResultsStep({
  t,
  cityId,
  inventoryId,
  importedFileId,
  onContinue,
}: ValidationResultsStepProps) {
  const { data, isLoading, error } = api.useGetImportStatusQuery(
    {
      cityId,
      inventoryId,
      importedFileId,
    },
    {
      skip: !cityId || !inventoryId || !importedFileId,
    },
  );

  const columns: ColumnInfo[] = data?.validationResults?.columns || [];
  const detectedCount = columns.filter(
    (col) => col.status === "detected",
  ).length;

  const EMISSION_FACTOR_LABELS = new Set([
    "Emission Factor - CO2",
    "Emission Factor - CH4",
    "Emission Factor - N2O",
    "Emission Factor - Total CO2e",
  ]);

  const formatExampleValue = (column: ColumnInfo): string | null => {
    if (!column.exampleValue) return null;
    if (
      column.interpretedAs &&
      EMISSION_FACTOR_LABELS.has(column.interpretedAs)
    ) {
      const num = parseFloat(column.exampleValue);
      if (!isNaN(num)) {
        const tonnes = num / 1000;
        const formatted =
          tonnes < 0.0001
            ? tonnes.toExponential(2)
            : parseFloat(tonnes.toFixed(4)).toString();
        return `${formatted} t CO2e`;
      }
    }
    return column.exampleValue;
  };

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading size="lg">{t("validation-results-heading")}</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("validation-results-description", {
            count: isLoading ? 0 : columns.length,
          })}
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
        {isLoading ? (
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
        ) : (
          <>
            {detectedCount > 0 && (
              <Box
                bg="success.subtle"
                borderRadius="md"
                p={4}
                mb={6}
                display="flex"
                alignItems="center"
                gap="12px"
              >
                <Icon as={MdCheck} boxSize={5} color="success.default" />
                <Box>
                  <Text fontWeight="medium" color="success.default">
                    {t("key-value-format-detected")}
                  </Text>
                  <Text fontSize="body.sm" color="content.secondary">
                    {t("fields-detected-automatically", {
                      detected: detectedCount,
                      total: columns.length,
                    })}
                  </Text>
                </Box>
              </Box>
            )}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>{t("field-name")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{t("value")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{t("interpreted-as")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{t("status")}</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {columns.map((column, index) => (
                  <Table.Row key={index}>
                    <Table.Cell>
                      <Text fontWeight="medium">{column.columnName}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {(() => {
                        const displayValue = formatExampleValue(column);
                        return (
                          <Text
                            color={
                              displayValue
                                ? "content.secondary"
                                : "content.tertiary"
                            }
                          >
                            {displayValue || t("not-specified")}
                          </Text>
                        );
                      })()}
                    </Table.Cell>
                    <Table.Cell>
                      <Text
                        color={
                          column.interpretedAs ? undefined : "content.tertiary"
                        }
                      >
                        {column.interpretedAs || t("not-specified")}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {column.status === "detected" && (
                        <Icon
                          as={MdCheck}
                          boxSize={5}
                          color="success.default"
                        />
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </>
        )}
      </Card.Root>
    </Box>
  );
}
