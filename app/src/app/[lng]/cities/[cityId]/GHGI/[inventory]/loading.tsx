import { Box, HStack } from "@chakra-ui/react";
import ModuleHeroSkeleton from "@/components/Skeletons/module-hero-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Below the Hero, the live page (GHGIHomePage/HomePage) is an mt="80px" gap
 * (InventoryPreferencesCard, currently feature-flagged off) followed by a
 * bg="background.backgroundLight" years section — title/actions row, a row
 * of year pills, then tabs. Shaped to that instead of the generic
 * title+divider+cards skeleton, which reads as city-home, not GHGI.
 */
export default function Loading() {
  return (
    <>
      <ModuleHeroSkeleton />
      <Box mt="80px" />
      <Box bg="background.backgroundLight" pt="48px" pb="100px" px={8}>
        <Box mx="auto" w="full" maxW="1090px">
          <HStack justifyContent="space-between" mb={6}>
            <Skeleton height="6" width="160px" />
            <HStack gap={4}>
              <Skeleton height="10" width="100px" />
              <Skeleton height="10" width="100px" />
              <Skeleton height="10" width="140px" />
            </HStack>
          </HStack>
          <HStack gap={3} mb={12}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height="8" width="72px" borderRadius="full" />
            ))}
          </HStack>
          <HStack gap={6} mb={6}>
            <Skeleton height="6" width="140px" />
            <Skeleton height="6" width="140px" />
            <Skeleton height="6" width="140px" />
          </HStack>
          <Skeleton height="320px" borderRadius="md" />
        </Box>
      </Box>
    </>
  );
}
