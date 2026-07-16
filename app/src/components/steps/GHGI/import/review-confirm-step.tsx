"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Spinner,
  Table,
  Text,
  VStack,
  HStack,
  Icon,
} from "@chakra-ui/react";
import { api } from "@/services/api";
import { Trans } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MdEdit, MdEditSquare, MdOutlineMap, MdOutlineModeEdit } from "react-icons/md";
import { BiEdit } from "react-icons/bi";
import { ConfirmDocumentIcon, EditIconOutlineSquare } from "@/components/icons";
import { LuRows4 } from "react-icons/lu";

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
        sampleValue: col.exampleValue || null,
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
      <VStack gap="32px" shadow="sm" borderRadius="8px" p="24px" mb="32px">
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
        <HStack w="full" alignItems="flex-start" gap="16px">
          <HStack w="174px" alignItems="flex-start">
            <Box display="flex" alignItems="flex-start" gap="4px">
              <Icon as={LuRows4} boxSize={6} color="content.tertiary" mt="2px"/>
              <VStack alignItems='flex-start' gap="4px">
                <Text fontSize="headline.sm" fontWeight="bold">{importSummary.rowsFound}</Text>
                <Text fontSize="body.sm" color="content.tertiary">{t("rows-in-file")}</Text>
              </VStack>
            </Box>
          </HStack>
          <HStack w="174px" alignItems="flex-start">
            <Box display="flex" alignItems="flex-start" gap="4px">
              <Icon as={MdOutlineMap} boxSize={6} color="content.tertiary" mt="2px"/>
              <VStack alignItems='flex-start' gap="4px">
                <Text fontSize="headline.sm" fontWeight="bold">{importSummary.fieldsMapped}</Text>
                <Text fontSize="body.sm" color="content.tertiary">{t("fields-mapped-in-file")}</Text>
              </VStack>
            </Box>
          </HStack>
        </HStack>
      </VStack>
      <Box
        w="full"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="lg"
        overflow="hidden"
        mb={8}
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
            {fieldMappings && fieldMappings.length > 0 ? (
              fieldMappings.map((mapping: any, index: number) => (
                <Table.Row key={index} h="72px">
                  <Table.Cell>
                    <Text fontWeight="medium">{mapping.sourceColumn}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text color={mapping.sampleValue ? "content.secondary" : "content.tertiary"}>
                      {mapping.sampleValue || t("not-specified")}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text color="content.secondary">{mapping.mappedField}</Text>
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={3}>
                  <Text color="content.tertiary" fontSize="body.sm">
                    {t("no-field-mappings")}
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Root>
      </Box>
    </Box>
  );
}
