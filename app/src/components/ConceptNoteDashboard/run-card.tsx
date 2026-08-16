import { Box, Flex, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { motion } from "framer-motion";
import NextLink from "next/link";

import { Button } from "@/components/ui/button";
import type { ConceptNoteRun } from "@/util/types";

import { StatusBadge } from "./status-badge";
import type { RunStatusTone } from "./utils";

interface RunCardProps {
  activityLabel: string;
  progress: number;
  progressLabel: string;
  reducedMotion: boolean;
  resumeHref: string;
  resumeLabel: string;
  run: ConceptNoteRun;
  scopeLabel: string;
  statusLabel: string;
  statusTone: RunStatusTone;
}

export function RunCard({
  activityLabel,
  progress,
  progressLabel,
  reducedMotion,
  resumeHref,
  resumeLabel,
  run,
  scopeLabel,
  statusLabel,
  statusTone,
}: RunCardProps) {
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
          <StatusBadge label={statusLabel} tone={statusTone} />
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
            h="4px"
            overflow="hidden"
            borderRadius="pill"
            bg="background.neutral"
          >
            <Box
              h="full"
              w={`${progress}%`}
              borderRadius="pill"
              bg="content.link"
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

        <HStack mt="auto">
          <Button asChild size="sm" variant="solid">
            <NextLink href={resumeHref}>{resumeLabel}</NextLink>
          </Button>
        </HStack>
      </VStack>
    </motion.div>
  );
}
