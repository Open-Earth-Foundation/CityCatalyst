"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Spinner,
  Text,
  VStack,
  HStack,
  Icon,
} from "@chakra-ui/react";
import { api } from "@/services/api";

interface ReviewConfirmStepProps {
  t: TFunction;
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onImport: () => void;
}

export default function ReviewConfirmStep({
  t,
  cityId,
  importedFileId,
  onImport,
  inventoryId,
}: ReviewConfirmStepProps) {
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

  if (isLoading) {
    return (
      <Box w="full">
        <Box display="flex" flexDir="column" gap="24px" mb={6}>
          <Heading size="lg">{t("review-confirm-heading")}</Heading>
          <Text fontSize="body.lg" color="content.tertiary">
            {t("review-confirm-description")}
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
              {t("loading")}
            </Text>
          </VStack>
        </Card.Root>
      </Box>
    );
  }

  const reviewData = data?.reviewData;
  const fileInfo = data?.fileInfo;
  const validationResults = data?.validationResults;
  
  // Fallback to fileInfo and validationResults if reviewData is not available
  const importSummary = reviewData?.importSummary || {
    sourceFile: fileInfo?.originalFileName || "-",
    formatDetected: fileInfo?.fileType?.toUpperCase() || "-",
    rowsFound: data?.rowCount || 0,
    fieldsMapped: reviewData?.fieldMappings?.length || validationResults?.columns?.filter((col: any) => col.interpretedAs).length || 0,
  };
  
  // Use field mappings from reviewData, or fallback to validation results
  const fieldMappings = reviewData?.fieldMappings || 
    (validationResults?.columns?.filter((col: any) => col.interpretedAs).map((col: any) => ({
      sourceColumn: col.columnName,
      mappedField: col.interpretedAs,
    })) || []);

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading size="lg">{t("review-confirm-heading")}</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("review-confirm-description")}
        </Text>
      </Box>

      <HStack gap="24px" alignItems="flex-start" mb={8}>
        <Card.Root
          px={6}
          py={8}
          shadow="none"
          bg="white"
          flex="1"
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border.default"
        >
          <Heading size="md" mb={6}>
            {t("import-summary")}
          </Heading>
          <VStack gap="16px" alignItems="flex-start">
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("source-file")}
              </Text>
              <Text fontWeight="medium">
                {importSummary.sourceFile}
              </Text>
            </Box>
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("format-detected")}
              </Text>
              <Text fontWeight="medium">
                {importSummary.formatDetected}
              </Text>
            </Box>
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("fields-found")}
              </Text>
              <Text fontWeight="medium">
                {importSummary.rowsFound}
              </Text>
            </Box>
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("fields-mapped")}
              </Text>
              <Text fontWeight="medium">
                {importSummary.fieldsMapped}
              </Text>
            </Box>
          </VStack>
        </Card.Root>

        <Card.Root
          px={6}
          py={8}
          shadow="none"
          bg="white"
          flex="1"
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border.default"
        >
          <Heading size="md" mb={6}>
            {t("field-mappings")}
          </Heading>
          <VStack gap="12px" alignItems="flex-start" maxH="400px" overflowY="auto">
            {fieldMappings && fieldMappings.length > 0 ? (
              fieldMappings.map((mapping: any, index: number) => (
                <Box
                  key={index}
                  w="full"
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={2}
                  borderBottomWidth="1px"
                  borderColor="border.overlay"
                >
                  <Text fontWeight="medium">{mapping.sourceColumn}</Text>
                  <Text color="content.secondary">{mapping.mappedField}</Text>
                </Box>
              ))
            ) : (
              <Text color="content.tertiary" fontSize="body.sm">
                {t("no-field-mappings")}
              </Text>
            )}
          </VStack>
        </Card.Root>
      </HStack>
    </Box>
  );
}
