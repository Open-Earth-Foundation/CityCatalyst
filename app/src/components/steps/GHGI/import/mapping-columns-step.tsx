"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Table,
  Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";

interface MappingColumnsStepProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onContinue: () => void;
}

interface ColumnMapping {
  columnName: string;
  value: string;
  mappedTo: string;
  options: string[];
}

export default function MappingColumnsStep({
  t,
  cityId,
  inventoryId,
  importedFileId,
  onContinue,
}: MappingColumnsStepProps) {
  const [columns, setColumns] = useState<ColumnMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchColumnMappings = async () => {
      try {
        const response = await fetch(
          `/api/v1/city/${cityId}/inventory/${inventoryId}/import/${importedFileId}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch column mappings");
        }

        const result = await response.json();
        if (result.data?.validationResults?.columns) {
          const mapped = result.data.validationResults.columns.map(
            (col: any) => ({
              columnName: col.columnName,
              value: col.exampleValue || "-",
              mappedTo: col.interpretedAs || "",
              options: ["Type of Economy", "Geographic Boundary", "Country", "Region / State", "City Name"],
            }),
          );
          setColumns(mapped);
        }
      } catch (error) {
        console.error("Error fetching column mappings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchColumnMappings();
  }, [cityId, inventoryId, importedFileId]);

  const handleMappingChange = (index: number, newMapping: string) => {
    setColumns((prev) =>
      prev.map((col, i) =>
        i === index ? { ...col, mappedTo: newMapping } : col,
      ),
    );
  };

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading size="lg">Map rows to inventory fields</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          Review and adjust the mapping of your data to the inventory fields.
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
              <Table.ColumnHeader>Field Name</Table.ColumnHeader>
              <Table.ColumnHeader>Value</Table.ColumnHeader>
              <Table.ColumnHeader>Map To</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {columns.map((column, index) => (
              <Table.Row key={index}>
                <Table.Cell>
                  <Text fontWeight="medium">{column.columnName}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text color="content.secondary">{column.value}</Text>
                </Table.Cell>
                <Table.Cell>
                  <SelectRoot
                    value={[column.mappedTo]}
                    onValueChange={(e) =>
                      handleMappingChange(index, e.value[0])
                    }
                  >
                    <SelectTrigger>
                      <SelectValueText placeholder="Select mapping" />
                    </SelectTrigger>
                    <SelectContent>
                      {column.options.map((option, optIndex) => (
                        <SelectItem key={optIndex} item={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>
    </Box>
  );
}
