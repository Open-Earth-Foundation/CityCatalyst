"use client";

import {
  Box,
  Flex,
  HStack,
  Icon,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  LuBookOpen,
  LuCheck,
  LuCircleAlert,
  LuDatabase,
  LuFileText,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

interface DraftTabProps {
  bundle: ConceptNoteBundleProgress;
  isRetrying: boolean;
  lng: string;
  noteName: string;
  onOpenContext: () => void;
  onRetry: () => void;
}

export function DraftTab({
  bundle,
  isRetrying,
  lng,
  noteName,
  onOpenContext,
  onRetry,
}: DraftTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const isReady = bundle.status === "ready";
  const isBuilding = bundle.status === "building";
  const isFailed = bundle.status === "failed";

  return (
    <VStack align="stretch" gap={0} minH="720px" bg="background.neutral">
      <Flex
        align={{ base: "start", md: "center" }}
        justify="space-between"
        direction={{ base: "column", md: "row" }}
        gap={3}
        borderBottom="1px solid"
        borderColor="border.neutral"
        bg="base.light"
        px={5}
        py={3}
      >
        <HStack gap={2}>
          <Icon as={LuFileText} color="content.link" />
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("draft-canvas")}
          </Text>
        </HStack>
        <HStack gap={2}>
          <Box
            boxSize="7px"
            borderRadius="full"
            bg={
              isReady ? "sentiment.positiveDefault" : "sentiment.warningDefault"
            }
          />
          <Text fontSize="label.sm" color="content.secondary">
            {isReady
              ? t("context-ready")
              : isBuilding
                ? t("assembling-context")
                : t("setup-incomplete")}
          </Text>
        </HStack>
      </Flex>

      <Box flex={1} p={{ base: 4, md: 8 }}>
        <Box
          maxW="760px"
          minH="660px"
          mx="auto"
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="minimal"
          bg="base.light"
          px={{ base: 5, md: 10 }}
          py={{ base: 7, md: 10 }}
          boxShadow="4dp"
        >
          <Text
            fontFamily="heading"
            fontSize="overline"
            fontWeight="semibold"
            letterSpacing="widest"
            color="content.tertiary"
            textTransform="uppercase"
          >
            {t("concept-note")}
          </Text>
          <Text
            mt={2}
            fontFamily="heading"
            fontSize={{ base: "title.lg", md: "headline.sm" }}
            fontWeight="semibold"
            lineHeight="1.25"
            color="content.primary"
          >
            {noteName}
          </Text>

          <Box my={7} h="1px" bg="border.neutral" />

          {isBuilding ? (
            <VStack align="stretch" gap={4}>
              <HStack gap={3} color="content.link">
                <Icon as={LuSparkles} />
                <Text
                  fontFamily="heading"
                  fontSize="title.sm"
                  color="content.primary"
                >
                  {t("building-source-context")}
                </Text>
              </HStack>
              <Text
                fontSize="body.sm"
                lineHeight="24px"
                color="content.secondary"
              >
                {t("building-source-context-description")}
              </Text>
              {["80%", "96%", "72%", "88%"].map((width) => (
                <Skeleton key={width} h="14px" w={width} />
              ))}
            </VStack>
          ) : isFailed ? (
            <VStack
              align="start"
              gap={4}
              border="1px solid"
              borderColor="sentiment.negativeDefault"
              borderRadius="rounded"
              bg="sentiment.negativeOverlay"
              p={5}
            >
              <HStack gap={2}>
                <Icon as={LuCircleAlert} color="sentiment.negativeDefault" />
                <Text
                  fontFamily="heading"
                  fontSize="title.sm"
                  color="content.primary"
                >
                  {t("context-needs-attention")}
                </Text>
              </HStack>
              <Text
                fontSize="body.sm"
                lineHeight="24px"
                color="content.secondary"
              >
                {bundle.warnings[0] || t("context-failed-description")}
              </Text>
              {bundle.retryable && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={isRetrying}
                  onClick={onRetry}
                >
                  <Icon as={LuRefreshCw} />
                  {t("retry-context")}
                </Button>
              )}
            </VStack>
          ) : isReady ? (
            <VStack align="stretch" gap={6}>
              <Flex
                align="start"
                gap={3}
                border="1px solid"
                borderColor="sentiment.positiveDefault"
                borderRadius="rounded"
                bg="sentiment.positiveOverlay"
                p={4}
              >
                <Icon as={LuCheck} mt={0.5} color="sentiment.positiveDefault" />
                <Box>
                  <Text
                    fontFamily="heading"
                    fontSize="body.sm"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("source-context-assembled")}
                  </Text>
                  <Text
                    mt={1}
                    fontSize="label.sm"
                    lineHeight="20px"
                    color="content.secondary"
                  >
                    {t("source-context-count", { count: bundle.readySources })}
                  </Text>
                </Box>
              </Flex>

              <VStack align="center" gap={4} py={10} textAlign="center">
                <Flex
                  boxSize="52px"
                  align="center"
                  justify="center"
                  borderRadius="rounded"
                  bg="background.alternativeLight"
                  color="content.link"
                >
                  <Icon as={LuBookOpen} boxSize={6} />
                </Flex>
                <Box maxW="480px">
                  <Text
                    fontFamily="heading"
                    fontSize="title.md"
                    color="content.primary"
                  >
                    {t("drafting-backend-needed-title")}
                  </Text>
                  <Text
                    mt={2}
                    fontSize="body.sm"
                    lineHeight="24px"
                    color="content.secondary"
                  >
                    {t("drafting-backend-needed-description")}
                  </Text>
                </Box>
                <Button size="sm" variant="outline" onClick={onOpenContext}>
                  <Icon as={LuDatabase} />
                  {t("review-context")}
                </Button>
              </VStack>
            </VStack>
          ) : (
            <VStack align="center" gap={4} py={12} textAlign="center">
              <Flex
                boxSize="52px"
                align="center"
                justify="center"
                borderRadius="rounded"
                bg="background.alternativeLight"
                color="content.link"
              >
                <Icon as={LuDatabase} boxSize={6} />
              </Flex>
              <Box maxW="480px">
                <Text
                  fontFamily="heading"
                  fontSize="title.md"
                  color="content.primary"
                >
                  {t("blank-note-title")}
                </Text>
                <Text
                  mt={2}
                  fontSize="body.sm"
                  lineHeight="24px"
                  color="content.secondary"
                >
                  {t("blank-note-description")}
                </Text>
              </Box>
              <Button size="sm" variant="solid" onClick={onOpenContext}>
                {t("add-source-pdf")}
              </Button>
            </VStack>
          )}
        </Box>
      </Box>
    </VStack>
  );
}
