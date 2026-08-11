"use client";

import { Box, Flex, Heading, Icon, Text, VStack } from "@chakra-ui/react";
import { FiArrowRight, FiFileText, FiMapPin } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import type { ConceptNoteWiringController } from "./use-concept-note-wiring";
import { uploadStatusTranslationKey } from "./utils";
import { Overline, StatusBadge } from "./concept-note-wiring-ui";

interface ConceptNoteHomeScreenProps {
  controller: ConceptNoteWiringController;
  lng: string;
  reducedMotion: boolean;
}

export function ConceptNoteHomeScreen({
  controller,
  lng,
  reducedMotion,
}: ConceptNoteHomeScreenProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const statusLabel = t(uploadStatusTranslationKey(controller.uploadStatus));

  return (
    <VStack align="stretch" gap={8} maxW="1180px" mx="auto" bg="base.light">
      <Flex
        align={{ base: "stretch", md: "end" }}
        direction={{ base: "column", md: "row" }}
        gap={5}
      >
        <Box flex={1}>
          <Overline>{t("wiring-eyebrow")}</Overline>
          <Heading
            as="h1"
            mt={1.5}
            fontFamily="heading"
            fontSize={{ base: "headline.md", md: "headline.lg" }}
            fontWeight="medium"
            color="content.primary"
          >
            {t("title")}
          </Heading>
          <Text
            maxW="660px"
            mt={2}
            fontSize="body.md"
            lineHeight="24"
            color="content.tertiary"
          >
            {t("wiring-description")}
          </Text>
        </Box>
        <Button type="button" variant="solid" onClick={controller.openNewRun}>
          {t("new-concept-note")}
          <Icon as={FiArrowRight} />
        </Button>
      </Flex>

      <Flex
        align={{ base: "start", sm: "center" }}
        direction={{ base: "column", sm: "row" }}
        gap={4}
        border="1px solid"
        borderColor="border.neutral"
        borderLeftWidth="3px"
        borderLeftColor="content.link"
        borderRadius="rounded"
        bg="base.light"
        p={4}
        boxShadow="1dp"
      >
        <Flex
          boxSize="36px"
          flexShrink={0}
          align="center"
          justify="center"
          borderRadius="rounded"
          bg="background.neutral"
          color="content.link"
        >
          <Icon as={FiMapPin} />
        </Flex>
        <Box flex={1}>
          <Overline>{t("shared-city-context")}</Overline>
          <Text mt={0.5} fontWeight="semibold" color="content.primary">
            {controller.cityName}
          </Text>
        </Box>
        <StatusBadge label={t("city-access-connected")} status="ready" />
      </Flex>

      <Box>
        <Flex align="end" justify="space-between" gap={4} mb={4}>
          <Box>
            <Overline>{t("browser-runs")}</Overline>
            <Heading
              as="h2"
              mt={1}
              fontFamily="heading"
              fontSize="headline.sm"
              fontWeight="medium"
              color="content.primary"
            >
              {t("wiring-checks")}
            </Heading>
          </Box>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("browser-run-count", { count: controller.runId ? 1 : 0 })}
          </Text>
        </Flex>

        {controller.runId ? (
          <VStack
            as="article"
            align="stretch"
            gap={4}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            bg="base.light"
            p={5}
            boxShadow="2dp"
          >
            <Flex align="start" justify="space-between" gap={4}>
              <Box>
                <StatusBadge
                  label={statusLabel}
                  status={controller.uploadStatus}
                />
                <Heading
                  as="h3"
                  mt={3}
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="medium"
                  color="content.primary"
                >
                  {controller.noteName}
                </Heading>
              </Box>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={controller.showScope}
              >
                {t("resume")}
              </Button>
            </Flex>
            <Box
              h="4px"
              overflow="hidden"
              borderRadius="pill"
              bg="background.neutral"
            >
              <Box
                h="full"
                w={controller.uploadStatus === "ready" ? "100%" : "42%"}
                borderRadius="pill"
                bg={
                  controller.uploadStatus === "ready"
                    ? "sentiment.positiveDefault"
                    : "content.link"
                }
                transition={reducedMotion ? "none" : "width 180ms ease"}
              />
            </Box>
            <Text fontSize="body.sm" color="content.tertiary">
              {controller.selectedFile?.name || t("run-upload-incomplete")}
            </Text>
          </VStack>
        ) : (
          <Flex
            align={{ base: "start", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap={4}
            border="1px dashed"
            borderColor="border.neutral"
            borderRadius="rounded"
            bg="base.light"
            p={6}
          >
            <Flex
              boxSize="44px"
              flexShrink={0}
              align="center"
              justify="center"
              borderRadius="rounded"
              bg="background.neutral"
              color="content.link"
            >
              <Icon as={FiFileText} />
            </Flex>
            <Box flex={1}>
              <Heading
                as="h3"
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="medium"
                color="content.primary"
              >
                {t("no-wiring-run-title")}
              </Heading>
              <Text mt={1} fontSize="body.sm" color="content.tertiary">
                {t("no-wiring-run-description")}
              </Text>
            </Box>
            <Button
              type="button"
              variant="outline"
              onClick={controller.openNewRun}
            >
              {t("start-check")}
              <Icon as={FiArrowRight} />
            </Button>
          </Flex>
        )}
      </Box>
    </VStack>
  );
}
