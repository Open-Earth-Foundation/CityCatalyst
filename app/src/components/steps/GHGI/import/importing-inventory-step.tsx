"use client";

import { TFunction } from "i18next";
import { Box, Card, Heading, Spinner, Text, VStack } from "@chakra-ui/react";

interface ImportingInventoryStepProps {
  t: TFunction;
  cityName?: string;
}

/**
 * Stable intermediate UI shown while the approved import is running.
 * Prevents ReviewConfirmStep from flashing emptied mapping data after
 * status polling leaves waiting_for_approval.
 */
export default function ImportingInventoryStep({
  t,
  cityName,
}: ImportingInventoryStepProps) {
  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        {cityName && (
          <Text fontSize="body.md" color="content.tertiary" fontWeight="medium">
            {cityName}
          </Text>
        )}
        <Heading size="lg" fontSize="display.sm">
          {t("importing-inventory")}
        </Heading>
        <Text fontSize="body.lg" color="content.tertiary" fontFamily="body">
          {t("importing-inventory-description")}
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
          <Spinner size="lg" color="interactive.secondary" />
          <Text fontSize="body.md" color="content.secondary">
            {t("importing-inventory-status")}
          </Text>
        </VStack>
      </Card.Root>
    </Box>
  );
}
