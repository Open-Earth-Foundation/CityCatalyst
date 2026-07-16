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
import { Trans } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MdEdit, MdEditSquare, MdOutlineModeEdit } from "react-icons/md";
import { BiEdit } from "react-icons/bi";
import { ConfirmDocumentIcon, EditIconOutlineSquare } from "@/components/icons";

interface ReviewConfirmStepProps {
  t: TFunction;
  cityId: string;
  cityName?: string;
  inventoryId: string;
  importedFileId: string;
  onImport: () => void;
}

export default function ReviewConfirmStep({
  t,
  cityId,
  cityName,
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
          {cityName && (
            <Text fontSize="body.md" color="content.tertiary" fontWeight="medium">
              {cityName}
            </Text>
          )}
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
          <VStack
            gap="16px"
            py={12}
            alignItems="center"
            justifyContent="center"
          >
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
    sourceFile: fileInfo?.originalFileName || null,
    formatDetected: fileInfo?.fileType?.toUpperCase() || null,
    rowsFound: data?.rowCount || 0,
    fieldsMapped:
      reviewData?.fieldMappings?.length ||
      validationResults?.columns?.filter((col: any) => col.interpretedAs)
        .length ||
      0,
  };

  // Use field mappings from reviewData, or fallback to validation results
  const fieldMappings =
    reviewData?.fieldMappings ||
    validationResults?.columns
      ?.filter((col: any) => col.interpretedAs)
      .map((col: any) => ({
        sourceColumn: col.columnName,
        mappedField: col.interpretedAs,
      })) ||
    [];

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        {cityName && (
          <Text fontSize="body.md" color="content.tertiary" fontWeight="medium">
            {cityName}
          </Text>
        )}
        <Heading size="lg" fontSize="display.sm">{t("review-confirm-heading")}</Heading>
        <Trans i18nKey="review-confirm-description" t={t}>
          <Text fontSize="body.lg" color="content.tertiary" fontFamily="body">
            Please <Text as="span" fontWeight="bold">carefully review all fields</Text>and confirm the upload since you won&apos;t be able to modify it later on.
          </Text>
        </Trans>
      </Box>
      <VStack>
        <HStack justifyContent="space-between" alignItems="flex-start" w="full">
          <Box display="flex" alignItems="flex-start" gap="4px">
            <Icon as={ConfirmDocumentIcon} w={8} h={8} />
            <VStack alignItems='flex-start' gap="4px">
              <Text fontSize="headline.sm" fontWeight="bold">{importSummary.sourceFile}</Text>
              <Text fontSize="body.sm" color="content.tertiary">{t("file-name")}</Text>
            </VStack>
          </Box>
          <Button p="24px" >
            <Icon as={EditIconOutlineSquare} />
            {t('edit-mapping')}
          </Button>
        </HStack>
      </VStack>

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
              <Text
                fontWeight={importSummary.sourceFile ? "medium" : undefined}
                color={
                  importSummary.sourceFile ? undefined : "content.tertiary"
                }
              >
                {importSummary.sourceFile || t("not-specified")}
              </Text>
            </Box>
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("format-detected")}
              </Text>
              <Text
                fontWeight={
                  importSummary.formatDetected ? "medium" : undefined
                }
                color={
                  importSummary.formatDetected ? undefined : "content.tertiary"
                }
              >
                {importSummary.formatDetected || t("not-specified")}
              </Text>
            </Box>
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("rows-found")}
              </Text>
              <Text fontWeight="medium">{importSummary.rowsFound}</Text>
            </Box>
            <Box w="full">
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                {t("fields-mapped")}
              </Text>
              <Text fontWeight="medium">{importSummary.fieldsMapped}</Text>
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
          <VStack
            gap="12px"
            alignItems="flex-start"
            maxH="400px"
            overflowY="auto"
          >
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
