"use client";

import {
  Box,
  Flex,
  Grid,
  Heading,
  Icon,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowLeft, LuRefreshCw } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

export function WorkspaceLoadingState() {
  return (
    <Box
      h="calc(100dvh - 80px)"
      minH={0}
      overflow="hidden"
      bg="background.alternativeLight"
      px={{ base: 4, md: 10 }}
      py={8}
    >
      <VStack align="stretch" gap={5} h="full" minH={0} maxW="1480px" mx="auto">
        <Skeleton h="70px" />
        <Grid
          flex={1}
          minH={0}
          gap={5}
          gridTemplateColumns={{
            base: "minmax(0, 1fr)",
            lg: "360px minmax(0, 1fr)",
            xl: "440px minmax(0, 1fr)",
          }}
          gridTemplateRows={{
            base: "repeat(2, minmax(0, 1fr))",
            lg: "minmax(0, 1fr)",
          }}
        >
          <Skeleton h="full" minH={0} />
          <Skeleton h="full" minH={0} />
        </Grid>
      </VStack>
    </Box>
  );
}

interface WorkspaceUnavailableStateProps {
  cityId: string;
  lng: string;
  onRetry: () => void;
  transientLoadFailure: boolean;
}

export function WorkspaceUnavailableState({
  cityId,
  lng,
  onRetry,
  transientLoadFailure,
}: WorkspaceUnavailableStateProps) {
  const { t } = useTranslation(lng, "concept-notes");

  return (
    <Flex
      h="calc(100dvh - 80px)"
      minH={0}
      overflow="hidden"
      align="center"
      justify="center"
      bg="background.alternativeLight"
      p={6}
    >
      <VStack
        align="start"
        gap={4}
        maxW="560px"
        border="1px solid"
        borderColor="sentiment.negativeDefault"
        borderRadius="rounded"
        bg="sentiment.negativeOverlay"
        p={6}
      >
        <Heading
          as="h1"
          fontFamily="heading"
          fontSize="title.md"
          color="content.primary"
        >
          {t(
            transientLoadFailure
              ? "workspace-refresh-error-title"
              : "workspace-load-error-title",
          )}
        </Heading>
        <Text fontSize="body.sm" color="content.secondary">
          {t(
            transientLoadFailure
              ? "workspace-refresh-error-description"
              : "workspace-load-error-description",
          )}
        </Text>
        {transientLoadFailure ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <Icon as={LuRefreshCw} />
            {t("try-again")}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <NextLink href={`/${lng}/cities/${cityId}/concept-notes`}>
              <Icon as={LuArrowLeft} />
              {t("all-concept-notes")}
            </NextLink>
          </Button>
        )}
      </VStack>
    </Flex>
  );
}
