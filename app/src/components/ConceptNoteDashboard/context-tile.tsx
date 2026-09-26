import type { ReactNode } from "react";

import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";

import {
  ContextStatusBadge,
  type ContextTone,
} from "../ConceptNoteWorkspace/context-status-badge";
import {
  ContextSourceActionButton,
  type ContextSourceAction,
} from "./context-source-action";

interface ContextTileProps {
  action?: ContextSourceAction;
  detail: ReactNode;
  help?: ReactNode;
  icon: IconType;
  label: string;
  status?: string;
  statusTone?: ContextTone;
  value: ReactNode;
}

export function ContextTile({
  action,
  detail,
  help,
  icon,
  label,
  status,
  statusTone = "neutral",
  value,
}: ContextTileProps) {
  return (
    <VStack
      align="stretch"
      gap={2.5}
      minH="178px"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={3}
      boxShadow="1dp"
    >
      <Flex align="center" justify="space-between" gap={2}>
        <Text
          fontFamily="heading"
          fontSize="overline"
          fontWeight="semibold"
          letterSpacing="widest"
          color="content.tertiary"
          textTransform="uppercase"
        >
          {label}
        </Text>
        {action ? (
          <ContextSourceActionButton action={action} />
        ) : (
          <Icon as={icon} boxSize={3.5} color="content.link" />
        )}
      </Flex>
      {status && <ContextStatusBadge label={status} tone={statusTone} />}
      <Box
        fontFamily="heading"
        fontSize="title.sm"
        fontWeight="semibold"
        lineHeight="20"
        color="content.primary"
      >
        {value}
      </Box>
      <Box
        mt="auto"
        fontFamily="body"
        fontSize="label.sm"
        lineHeight="16"
        color="content.tertiary"
      >
        {detail}
        {help && <Box mt={1}>{help}</Box>}
      </Box>
    </VStack>
  );
}
