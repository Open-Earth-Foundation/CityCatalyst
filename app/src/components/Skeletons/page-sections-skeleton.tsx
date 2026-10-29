import { Box, HStack, VStack } from "@chakra-ui/react";
import { Skeleton, SkeletonCircle } from "../ui/skeleton";

/**
 * Matches the "section title + divider + stacked blocks" shape shared by
 * the content below the Hero on the city home page (HomePageJN/HomePage)
 * and the GHGI inventory home (GHGIHomePage/HomePage) — a headline row,
 * a divider, then stacked module/sector blocks.
 */
const PageSectionsSkeleton = () => {
  return (
    <Box maxW="1090px" w="full" mx="auto" pb="100px">
      <HStack my={8} gap={3}>
        <SkeletonCircle size="6" />
        <Skeleton height="6" width="220px" />
      </HStack>
      <Box h="2px" bg="border.neutral" mb="48px" />
      <VStack align="stretch" gap={6}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height="120px" borderRadius="md" />
        ))}
      </VStack>
    </Box>
  );
};

export default PageSectionsSkeleton;
