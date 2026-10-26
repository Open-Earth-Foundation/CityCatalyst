import { Box, HStack, VStack } from "@chakra-ui/react";
import { Skeleton, SkeletonCircle } from "../ui/skeleton";

/**
 * Matches the plain (no background band) Hero used on the city home page
 * (components/HomePageJN/Hero.tsx) — title/flag/stats on the left, map on
 * the right.
 */
const HomeHeroSkeleton = () => {
  return (
    <Box py={12} w="full">
      <Box maxW="1090px" mx="auto">
        <HStack align="center" gap={8}>
          <VStack align="start" flex={1} gap={6} w="full">
            <Skeleton height="4" width="25%" />
            <HStack gap={3}>
              <SkeletonCircle size="8" />
              <Skeleton height="8" width="220px" />
            </HStack>
            <HStack gap={8}>
              <Skeleton height="12" width="140px" />
              <Skeleton height="12" width="140px" />
            </HStack>
          </VStack>
          <Box h="317px" w="422px" display={{ base: "none", lg: "block" }}>
            <Skeleton h="full" w="full" />
          </Box>
        </HStack>
      </Box>
    </Box>
  );
};

export default HomeHeroSkeleton;
