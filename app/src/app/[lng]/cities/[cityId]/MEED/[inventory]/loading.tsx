import { Box, VStack } from "@chakra-ui/react";
import ModuleHeroSkeleton from "@/components/Skeletons/module-hero-skeleton";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { MeedCardGridSkeleton } from "../components/MeedSkeletons";

export default function Loading() {
  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <ModuleHeroSkeleton compact />
      <Box
        display="flex"
        mx="auto"
        pt="xxl"
        pb="xxl-6"
        px="l"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="xl"
      >
        <VStack alignItems="stretch" gap="s" py="l">
          <Skeleton height="8" width="40%" />
          <SkeletonText noOfLines={2} gap="s" width="60%" />
        </VStack>
        <MeedCardGridSkeleton items={5} />
      </Box>
    </Box>
  );
}
