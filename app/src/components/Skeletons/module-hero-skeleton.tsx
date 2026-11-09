import { Box, HStack, VStack } from "@chakra-ui/react";
import { Skeleton, SkeletonCircle } from "../ui/skeleton";

/**
 * Matches the dark banner Hero (components/GHGIHomePage/Hero.tsx) used
 * across the GHGI and MEED module homes. `compact` mirrors the Hero's own
 * `variant="compact"` — same height rules so the real Hero can't cause a
 * jump once it mounts.
 */
const ModuleHeroSkeleton = ({ compact = false }: { compact?: boolean }) => {
  return (
    <Box
      bg="content.alternative"
      w="full"
      h={compact ? "auto" : "491px"}
      pt={compact ? "xxl" : "80px"}
      pb={compact ? "xl" : 0}
      px={8}
    >
      <VStack align="start" gap="24px" mx="auto" maxW="full" w="1090px">
        <HStack gap={2}>
          <Skeleton height="4" width="80px" />
          <Skeleton height="4" width="100px" />
        </HStack>
        <HStack gap={4}>
          <SkeletonCircle size="8" />
          <Skeleton height="8" width="220px" />
        </HStack>
        {compact ? (
          <Skeleton height="5" width="280px" />
        ) : (
          <HStack gap={8} mt="24px">
            <Skeleton height="12" width="160px" />
            <Skeleton height="12" width="160px" />
            <Skeleton height="12" width="160px" />
          </HStack>
        )}
      </VStack>
    </Box>
  );
};

export default ModuleHeroSkeleton;
