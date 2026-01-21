"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Icon,
  Table,
  Text,
} from "@chakra-ui/react";
import { MdCheck } from "react-icons/md";
import { useEffect, useState } from "react";

interface ValidationResultsStepProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onContinue: () => void;
}

interface ColumnInfo {
  columnName: string;
  interpretedAs: string | null;
  status: "detected" | "manual";
  exampleValue: string | null;
}

export default function ValidationResultsStep({
  t,
  cityId,
  inventoryId,
  importedFileId,
  onContinue,
}: ValidationResultsStepProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchValidationResults = async () => {
      try {
        const response = await fetch(
          `/api/v1/city/${cityId}/inventory/${inventoryId}/import/${importedFileId}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch validation results");
        }

        const result = await response.json();
        if (result.data?.validationResults?.columns) {
          setColumns(result.data.validationResults.columns);
        }
      } catch (error) {
        console.error("Error fetching validation results:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchValidationResults();
  }, [cityId, inventoryId, importedFileId]);

  const detectedCount = columns.filter((col) => col.status === "detected").length;

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading size="lg">Validation results</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          A key-value format with {columns.length} fields has been detected.
          Review the interpretations below.
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
                Key-value format detected successfully
              </Text>
              <Text fontSize="body.sm" color="content.secondary">
                {detectedCount} of {columns.length} fields detected automatically
              </Text>
            </Box>
          </Box>
        )}

        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Field Name</Table.ColumnHeader>
              <Table.ColumnHeader>Value</Table.ColumnHeader>
              <Table.ColumnHeader>Interpreted As</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {columns.map((column, index) => (
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
                  <Text>{column.interpretedAs || "-"}</Text>
                </Table.Cell>
                <Table.Cell>
                  {column.status === "detected" && (
                    <Icon as={MdCheck} boxSize={5} color="success.default" />
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>
    </Box>
  );
}
