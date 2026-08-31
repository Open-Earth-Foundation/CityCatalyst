import type { ReactNode } from "react";

import {
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiCheck } from "react-icons/fi";

import type { ConceptNoteUploadStatus } from "@/util/types";

interface PanelHeadingProps {
  aside?: ReactNode;
  eyebrow: string;
  step: string;
  title: string;
}

export const uploadStatusStyles: Record<
  ConceptNoteUploadStatus | "idle",
  { color: string; surface: string }
> = {
  idle: { color: "content.tertiary", surface: "background.graySubtle" },
  queued: { color: "content.link", surface: "background.neutral" },
  processing: {
    color: "sentiment.warningDefault",
    surface: "sentiment.warningOverlay",
  },
  ready: {
    color: "sentiment.positiveDefault",
    surface: "sentiment.positiveOverlay",
  },
  failed: {
    color: "sentiment.negativeDefault",
    surface: "sentiment.negativeOverlay",
  },
};

export function Overline({ children }: { children: ReactNode }) {
  return (
    <Text
      fontFamily="heading"
      fontSize="overline"
      fontWeight="semibold"
      letterSpacing="widest"
      lineHeight="16"
      color="content.tertiary"
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}

export function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: ConceptNoteUploadStatus | null;
}) {
  const styles = uploadStatusStyles[status ?? "idle"];

  return (
    <HStack
      gap={1.5}
      width="fit-content"
      border="1px solid"
      borderColor={styles.color}
      borderRadius="pill"
      bg={styles.surface}
      px={2.5}
      py={1}
    >
      <Box boxSize="6px" borderRadius="full" bg={styles.color} />
      <Text
        fontSize="label.sm"
        fontWeight="medium"
        lineHeight="16"
        color="content.secondary"
      >
        {label}
      </Text>
    </HStack>
  );
}

export function PanelHeading({
  aside,
  eyebrow,
  step,
  title,
}: PanelHeadingProps) {
  return (
    <Flex align="start" justify="space-between" gap={4}>
      <HStack align="start" gap={3}>
        <Flex
          boxSize="34px"
          flexShrink={0}
          align="center"
          justify="center"
          border="1px solid"
          borderColor="background.overlay"
          borderRadius="minimal"
          bg="background.alternativeLight"
          color="content.link"
          fontFamily="heading"
          fontSize="label.sm"
          fontWeight="semibold"
        >
          {step}
        </Flex>
        <Box>
          <Overline>{eyebrow}</Overline>
          <Heading
            as="h2"
            mt={0.5}
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="medium"
            color="content.primary"
          >
            {title}
          </Heading>
        </Box>
      </HStack>
      {aside}
    </Flex>
  );
}

export function WorkflowPanel({
  children,
  elevated = false,
}: {
  children: ReactNode;
  elevated?: boolean;
}) {
  return (
    <VStack
      as="section"
      align="stretch"
      gap={5}
      height={elevated ? "fit-content" : undefined}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={{ base: 4, md: 5 }}
      boxShadow={elevated ? "2dp" : "1dp"}
    >
      {children}
    </VStack>
  );
}

export function ScopeItem({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <VStack align="stretch" gap={1} minW={0} p={4}>
      <Overline>{label}</Overline>
      <Text fontSize="body.sm" fontWeight="semibold" color="content.primary">
        {value}
      </Text>
      <Text fontSize="label.sm" color="content.tertiary">
        {detail}
      </Text>
    </VStack>
  );
}

export function CheckItem({
  complete,
  detail,
  step,
  title,
}: {
  complete: boolean;
  detail: string;
  step: string;
  title: string;
}) {
  return (
    <HStack align="start" gap={3}>
      <Flex
        boxSize="28px"
        flexShrink={0}
        align="center"
        justify="center"
        border="1px solid"
        borderColor={complete ? "sentiment.positiveDefault" : "border.neutral"}
        borderRadius="full"
        bg={complete ? "sentiment.positiveOverlay" : "base.light"}
        color={complete ? "sentiment.positiveDefault" : "content.tertiary"}
        fontSize="label.sm"
        fontWeight="semibold"
      >
        {complete ? <Icon as={FiCheck} /> : step}
      </Flex>
      <Box>
        <Text fontSize="body.sm" fontWeight="semibold" color="content.primary">
          {title}
        </Text>
        <Text mt={0.5} fontSize="label.sm" color="content.tertiary">
          {detail}
        </Text>
      </Box>
    </HStack>
  );
}
