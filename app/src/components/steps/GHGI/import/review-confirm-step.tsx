"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Text,
  VStack,
  HStack,
  Icon,
} from "@chakra-ui/react";
import { MdArrowForward } from "react-icons/md";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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
}: ReviewConfirmStepProps) {
  const [reviewData, setReviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const fetchReviewData = async () => {
      try {
        const response = await fetch(
          `/api/v1/city/${cityId}/inventory/${inventoryId}/import/${importedFileId}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch review data");
        }

        const result = await response.json();
        if (result.data?.reviewData) {
          setReviewData(result.data.reviewData);
        }
      } catch (error) {
        console.error("Error fetching review data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReviewData();
  }, [cityId, inventoryId, importedFileId]);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const response = await fetch(
        `/api/v1/city/${cityId}/inventory/${inventoryId}/import/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            importedFileId,
            mappingOverrides: {},
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to approve import");
      }

      onImport();
    } catch (error) {
      console.error("Error approving import:", error);
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return <Box>Loading...</Box>;
  }

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading size="lg">Review and confirm</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          Review the import summary before finalizing.
        </Text>
      </Box>

      <HStack gap="24px" alignItems="flex-start">
        <Card.Root
          px={6}
          py={8}
          shadow="none"
          bg="white"
          w="50%"
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border.default"
        >
          <Heading size="md" mb={6}>
            Import Summary
          </Heading>
          <VStack gap="16px" alignItems="flex-start">
            <Box>
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                Source file
              </Text>
              <Text fontWeight="medium">
                {reviewData?.importSummary?.sourceFile || "-"}
              </Text>
            </Box>
            <Box>
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                Format detected
              </Text>
              <Text fontWeight="medium">
                {reviewData?.importSummary?.formatDetected || "-"}
              </Text>
            </Box>
            <Box>
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                Fields found
              </Text>
              <Text fontWeight="medium">
                {reviewData?.importSummary?.rowsFound || 0}
              </Text>
            </Box>
            <Box>
              <Text fontSize="body.sm" color="content.tertiary" mb={1}>
                Fields mapped
              </Text>
              <Text fontWeight="medium">
                {reviewData?.importSummary?.fieldsMapped || 0}
              </Text>
            </Box>
          </VStack>
        </Card.Root>

        <Card.Root
          px={6}
          py={8}
          shadow="none"
          bg="white"
          w="50%"
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border.default"
        >
          <Heading size="md" mb={6}>
            Field Mappings
          </Heading>
          <VStack gap="12px" alignItems="flex-start" maxH="400px" overflowY="auto">
            {reviewData?.fieldMappings?.map((mapping: any, index: number) => (
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
            ))}
          </VStack>
        </Card.Root>
      </HStack>

      <Box mt={8} display="flex" justifyContent="flex-end">
        <Button
          w="auto"
          gap="8px"
          py="16px"
          px="24px"
          onClick={handleImport}
          h="64px"
          loading={isImporting}
        >
          <Text
            fontFamily="button.md"
            fontWeight="600"
            letterSpacing="wider"
          >
            IMPORT INVENTORY
          </Text>
          <Icon as={MdArrowForward} boxSize={6} />
        </Button>
      </Box>
    </Box>
  );
}
