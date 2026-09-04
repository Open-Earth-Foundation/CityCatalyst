import {
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import type { TFunction } from "i18next";
import NextLink from "next/link";
import { LuPencil } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { ConceptNoteRun } from "@/util/types";

import { StatusBadge } from "./status-badge";
import { getConceptNoteStatusPresentation } from "./utils";

interface RunCardProps {
  activityLabel: string;
  duplicateLoading: boolean;
  lifecycleDisabled: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onRename: () => void;
  progress: number;
  progressLabel: string;
  reducedMotion: boolean;
  resumeHref: string;
  run: ConceptNoteRun;
  scopeLabel: string;
  t: TFunction;
}

export function RunCard({
  activityLabel,
  duplicateLoading,
  lifecycleDisabled,
  onDelete,
  onDuplicate,
  onExport,
  onRename,
  progress,
  progressLabel,
  reducedMotion,
  resumeHref,
  run,
  scopeLabel,
  t,
}: RunCardProps) {
  const { currentData: draft } = api.useGetConceptNoteDraftQuery(run.run_id);
  const status = getConceptNoteStatusPresentation(run.status, draft);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{ height: "100%" }}
    >
      <VStack
        as="article"
        data-testid={`concept-note-run-${run.run_id}`}
        align="stretch"
        gap={2.5}
        h="full"
        minH="178px"
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="rounded"
        bg="base.light"
        p={4}
        boxShadow="1dp"
        transition="border-color 160ms ease, box-shadow 160ms ease"
        _hover={{ borderColor: "background.overlay", boxShadow: "2dp" }}
        _motionReduce={{ transition: "none" }}
      >
        <Flex align="start" justify="space-between" gap={3}>
          <HStack minW={0} gap={1}>
            <Heading
              as="h2"
              minW={0}
              fontFamily="heading"
              fontSize="title.sm"
              fontWeight="semibold"
              lineHeight="20"
              color="content.primary"
            >
              {run.name}
            </Heading>
            <IconButton
              flexShrink={0}
              size="xs"
              variant="ghost"
              boxSize="24px"
              minW="24px"
              color="content.tertiary"
              onClick={onRename}
              disabled={lifecycleDisabled}
              aria-label={`${t("rename")}: ${run.name}`}
              _hover={{ color: "content.link", bg: "background.neutral" }}
            >
              <Icon as={LuPencil} boxSize={3.5} />
            </IconButton>
          </HStack>
          <StatusBadge label={t(status.translationKey)} tone={status.tone} />
        </Flex>

        <Text
          fontFamily="body"
          fontSize="body.sm"
          lineHeight="16"
          color="content.tertiary"
        >
          {scopeLabel}
        </Text>

        <Box>
          <Flex justify="space-between" gap={3} mb={1}>
            <Text fontSize="label.sm" color="content.tertiary">
              {progressLabel}
            </Text>
            <Text
              fontSize="label.sm"
              fontWeight="semibold"
              color="content.secondary"
            >
              {progress}%
            </Text>
          </Flex>
          <Box
            h="8px"
            overflow="hidden"
            borderRadius="pill"
            bg="background.neutral"
          >
            <Box
              h="full"
              w={`${progress}%`}
              borderRadius="pill"
              bg="sentiment.positiveDefault"
              transition="width 180ms ease"
              _motionReduce={{ transition: "none" }}
            />
          </Box>
        </Box>

        <Text
          fontFamily="body"
          fontSize="label.sm"
          lineHeight="16"
          color="content.tertiary"
        >
          {activityLabel}
        </Text>

        <HStack mt="auto" gap={2} flexWrap="wrap">
          <Button asChild size="sm" variant="solid" h="32px" px="14px" py="8px">
            <NextLink
              href={resumeHref}
              aria-label={`${t("resume")}: ${run.name}`}
            >
              {t("resume")}
            </NextLink>
          </Button>
          <Button
            size="sm"
            variant="outline"
            h="32px"
            px="14px"
            py="8px"
            onClick={onDuplicate}
            loading={duplicateLoading}
            disabled={lifecycleDisabled}
            aria-label={`${t("duplicate")}: ${run.name}`}
          >
            {t("duplicate")}
          </Button>
          <Button
            size="sm"
            variant="solid"
            h="32px"
            px="14px"
            py="8px"
            bg="sentiment.positiveDefault"
            color="base.light"
            onClick={onExport}
            disabled={lifecycleDisabled}
            aria-label={`${t("export")}: ${run.name}`}
          >
            {t("export")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            h="32px"
            px="14px"
            py="8px"
            onClick={onDelete}
            disabled={lifecycleDisabled}
            aria-label={`${t("delete")}: ${run.name}`}
          >
            {t("delete")}
          </Button>
        </HStack>
      </VStack>
    </motion.div>
  );
}
