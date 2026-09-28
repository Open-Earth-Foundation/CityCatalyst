"use client";

import { Box, Flex, HStack, Icon, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuCircleAlert, LuX } from "react-icons/lu";

import { Button } from "@/components/ui/button";

export interface NextStepAction {
  label: string;
  onClick: () => void;
  icon?: IconType;
  loading?: boolean;
  disabled?: boolean;
  testId?: string;
}

interface NextStepBannerProps {
  title: string;
  description?: string;
  primary?: NextStepAction;
  secondary?: NextStepAction;
  tone?: "info" | "warning";
  dismissLabel?: string;
  onDismiss?: () => void;
  testId?: string;
}

/**
 * One consistent "what to do next" surface for the workspace: used after a
 * funder is saved, when sources become ready, and when drafting completes.
 * Warning tone reuses the same layout for recoverable problems.
 */
export function NextStepBanner({
  title,
  description,
  primary,
  secondary,
  tone = "info",
  dismissLabel,
  onDismiss,
  testId = "concept-note-next-step",
}: NextStepBannerProps) {
  const warning = tone === "warning";
  return (
    <Flex
      role="status"
      align={{ base: "stretch", md: "center" }}
      direction={{ base: "column", md: "row" }}
      gap={3}
      border="1px solid"
      borderColor={warning ? "sentiment.warningDefault" : "content.link"}
      borderRadius="rounded"
      bg={warning ? "sentiment.warningOverlay" : "background.neutral"}
      px={4}
      py={3}
      data-testid={testId}
      data-tone={tone}
    >
      <HStack align="start" gap={3} flex={1} minW={0}>
        <Icon
          as={warning ? LuCircleAlert : LuArrowRight}
          mt={0.5}
          flexShrink={0}
          color={warning ? "sentiment.warningDefault" : "content.link"}
        />
        <Box minW={0}>
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {title}
          </Text>
          {description && (
            <Text
              mt={0.5}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {description}
            </Text>
          )}
        </Box>
      </HStack>
      <HStack gap={2} flexWrap="wrap" flexShrink={0}>
        {secondary && (
          <Button
            size="sm"
            variant="outline"
            disabled={secondary.disabled}
            loading={secondary.loading}
            onClick={secondary.onClick}
            data-testid={secondary.testId}
          >
            {secondary.icon && <Icon as={secondary.icon} />}
            {secondary.label}
          </Button>
        )}
        {primary && (
          <Button
            size="sm"
            variant={warning ? "outline" : "solid"}
            disabled={primary.disabled}
            loading={primary.loading}
            onClick={primary.onClick}
            data-testid={primary.testId}
          >
            {primary.icon && <Icon as={primary.icon} />}
            {primary.label}
          </Button>
        )}
        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            px={2}
            aria-label={dismissLabel ?? "Dismiss"}
            onClick={onDismiss}
            data-testid={`${testId}-dismiss`}
          >
            <Icon as={LuX} />
          </Button>
        )}
      </HStack>
    </Flex>
  );
}
