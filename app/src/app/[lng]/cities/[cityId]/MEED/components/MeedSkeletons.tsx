"use client";
import { Card, HStack, SimpleGrid, Stack, VStack } from "@chakra-ui/react";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Shaped loading placeholders.
 *
 * Every screen previously showed a line of text ("Loading…") or a bare "…"
 * while fetching, which made the layout jump once data arrived. These hold the
 * same space the real content will occupy.
 */

export function MeedTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card.Root overflow="hidden">
      <Stack gap="0" p="m">
        <Skeleton height="20px" width="40%" mb="m" />
        {Array.from({ length: rows }).map((_, i) => (
          <HStack key={i} py="m" gap="m">
            <Skeleton height="14px" flex="2" />
            <Skeleton height="14px" flex="1" />
            <Skeleton height="14px" flex="1" />
            <Skeleton height="14px" width="64px" />
          </HStack>
        ))}
      </Stack>
    </Card.Root>
  );
}

export function MeedCardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <Card.Root>
      <Card.Body>
        <VStack alignItems="stretch" gap="m">
          <Skeleton height="18px" width="55%" />
          <SkeletonText noOfLines={lines} gap="s" />
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export function MeedStatStripSkeleton({ items = 4 }: { items?: number }) {
  return (
    <SimpleGrid columns={{ base: 2, md: items }} gap="m">
      {Array.from({ length: items }).map((_, i) => (
        <VStack key={i} alignItems="flex-start" gap="s">
          <Skeleton height="12px" width="70%" />
          <Skeleton height="24px" width="50%" />
        </VStack>
      ))}
    </SimpleGrid>
  );
}

export function MeedCardGridSkeleton({ items = 6 }: { items?: number }) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="m">
      {Array.from({ length: items }).map((_, i) => (
        <MeedCardSkeleton key={i} />
      ))}
    </SimpleGrid>
  );
}
