import { Box } from "@chakra-ui/react";
import HomeHeroSkeleton from "@/components/Skeletons/home-hero-skeleton";
import DashboardWidgetsSkeleton from "@/components/Skeletons/dashboard-widgets-skeleton";

export default function Loading() {
  return (
    <Box h="100%" minH="100vh" bg="base.light">
      <HomeHeroSkeleton />
      <DashboardWidgetsSkeleton />
    </Box>
  );
}
