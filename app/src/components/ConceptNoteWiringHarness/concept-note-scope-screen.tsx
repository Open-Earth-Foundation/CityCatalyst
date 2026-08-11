"use client";

import {
  Box,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiArrowLeft, FiInfo } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useTranslation } from "@/i18n/client";

import { ConceptNoteUploadPanel } from "./concept-note-upload-panel";
import type { ConceptNoteWiringController } from "./use-concept-note-wiring";
import { uploadStatusTranslationKey } from "./utils";
import {
  CheckItem,
  Overline,
  PanelHeading,
  ScopeItem,
  StatusBadge,
  WorkflowPanel,
} from "./concept-note-wiring-ui";

interface ConceptNoteScopeScreenProps {
  controller: ConceptNoteWiringController;
  lng: string;
  reducedMotion: boolean;
}

export function ConceptNoteScopeScreen({
  controller,
  lng,
  reducedMotion,
}: ConceptNoteScopeScreenProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const statusLabel = t(uploadStatusTranslationKey(controller.uploadStatus));

  return (
    <VStack align="stretch" gap={6} maxW="1320px" mx="auto" bg="base.light">
      <Button
        type="button"
        width="fit-content"
        size="sm"
        variant="outline"
        onClick={controller.showHome}
      >
        <Icon as={FiArrowLeft} />
        {t("all-concept-notes")}
      </Button>

      <Flex
        align={{ base: "start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={4}
      >
        <Box flex={1}>
          <Overline>{t("scope-context-eyebrow")}</Overline>
          <Heading
            as="h1"
            mt={1.5}
            fontFamily="heading"
            fontSize={{ base: "headline.md", md: "headline.lg" }}
            fontWeight="medium"
            color="content.primary"
          >
            {controller.runId
              ? t("resume-concept-note")
              : t("start-concept-note")}
          </Heading>
        </Box>
        <StatusBadge label={t("local-wiring-harness")} status={null} />
      </Flex>

      <Grid
        overflow="hidden"
        gridTemplateColumns={{
          base: "1fr",
          md: "repeat(2, minmax(0, 1fr))",
          xl: "repeat(4, minmax(0, 1fr))",
        }}
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="1dp"
      >
        <ScopeItem
          label={t("city")}
          value={controller.cityName}
          detail={controller.cityCountry || t("city-access-connected")}
        />
        <ScopeItem
          label={t("workflow")}
          value={t("run-scoped-upload")}
          detail={t("workflow-detail")}
        />
        <ScopeItem
          label={t("funder")}
          value={t("not-set")}
          detail={t("optional-check")}
        />
        <ScopeItem
          label={t("status")}
          value={statusLabel}
          detail={
            controller.runId ? t("durable-run-created") : t("waiting-to-start")
          }
        />
      </Grid>

      <form onSubmit={controller.submitWiringTest}>
        <Grid
          gridTemplateColumns={{
            base: "1fr",
            lg: "minmax(0, 1fr) 380px",
          }}
          gap={6}
        >
          <VStack align="stretch" gap={5}>
            <WorkflowPanel>
              <PanelHeading
                step="01"
                eyebrow={t("run-identity")}
                title={t("name-application")}
                aside={
                  controller.runId ? (
                    <StatusBadge label={t("persisted")} status="ready" />
                  ) : null
                }
              />
              <Field label={t("concept-note-name")} required>
                <Input
                  value={controller.noteName}
                  maxLength={120}
                  disabled={controller.isBusy || Boolean(controller.runId)}
                  bg="base.light"
                  borderColor="border.neutral"
                  onChange={(event) =>
                    controller.setNoteName(event.target.value)
                  }
                />
              </Field>
              {controller.runId && (
                <Grid
                  gridTemplateColumns="auto minmax(0, 1fr)"
                  alignItems="center"
                  gap={3}
                  borderRadius="minimal"
                  bg="background.alternativeLight"
                  p={3}
                >
                  <Text fontSize="label.sm" color="content.tertiary">
                    {t("run-id")}
                  </Text>
                  <Text
                    as="code"
                    overflow="hidden"
                    fontSize="label.sm"
                    color="content.secondary"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    {controller.runId}
                  </Text>
                </Grid>
              )}
            </WorkflowPanel>

            <WorkflowPanel>
              <PanelHeading
                step="02"
                eyebrow={t("connected-context")}
                title={t("check-purpose")}
              />
              <Grid
                gridTemplateColumns={{
                  base: "1fr",
                  md: "repeat(3, 1fr)",
                }}
                gap={5}
              >
                <CheckItem
                  complete
                  step="1"
                  title={t("city-authorization")}
                  detail={t("validated-before-file")}
                />
                <CheckItem
                  complete={Boolean(controller.runId)}
                  step="2"
                  title={t("cnb-run-persistence")}
                  detail={t("authoritative-row")}
                />
                <CheckItem
                  complete={controller.uploadStatus === "ready"}
                  step="3"
                  title={t("ocr-pointer-delivery")}
                  detail={t("markdown-storage")}
                />
              </Grid>
            </WorkflowPanel>

            <HStack
              align="start"
              gap={3}
              borderLeft="3px solid"
              borderLeftColor="content.link"
              borderRadius="minimal"
              bg="background.neutral"
              p={4}
            >
              <Icon as={FiInfo} mt={0.5} color="content.link" />
              <Text fontSize="body.sm" color="content.secondary">
                {t("local-harness-note")}
              </Text>
            </HStack>
          </VStack>

          <ConceptNoteUploadPanel
            controller={controller}
            lng={lng}
            reducedMotion={reducedMotion}
          />
        </Grid>
      </form>
    </VStack>
  );
}
