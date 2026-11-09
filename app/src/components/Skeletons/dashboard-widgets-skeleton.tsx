import { Box, HStack, VStack } from "@chakra-ui/react";
import { Skeleton, SkeletonCircle } from "../ui/skeleton";

/**
 * Matches the content below the Hero on the city dashboard
 * (components/CityDashboard/CityDashboard.tsx) — header row (icon + title
 * + optional button), a divider, then the stacked module widgets.
 */
const DashboardWidgetsSkeleton = () => {
  return (
    <Box maxW="1090px" mx="auto">
      <HStack justifyContent="space-between" w="full">
        <HStack gap={4}>
          <SkeletonCircle size="6" />
          <Skeleton height="6" width="220px" />
        </HStack>
        <Skeleton height="10" width="120px" />
      </HStack>
      <Box h="1px" mt="6" bg="border.neutral" />
      <VStack align="stretch" gap={6} mt={6}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height="200px" borderRadius="md" />
        ))}
      </VStack>
    </Box>
  );
};

export default DashboardWidgetsSkeleton;
