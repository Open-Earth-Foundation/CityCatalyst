"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  NativeSelect,
  Table,
  Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";

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
    const fetchColumnMappings = async () => {};

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
            {columns.map((column, index) => (
              <Table.Row key={index}>
                <Table.Cell>
                  <Text fontWeight="medium">{column.columnName}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text color="content.secondary">{column.value}</Text>
                </Table.Cell>
                <Table.Cell>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      value={column.mappedTo || ""}
                      onChange={(e) =>
                        handleMappingChange(index, e.target.value)
                      }
                    >
                      <option value="">{t("select-mapping")}</option>
                      {column.options.map((option, optIndex) => (
                        <option key={optIndex} value={option}>
                          {option}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>
    </Box>
  );
}
