"use client";
import { use, useEffect } from "react";

import HomePage from "@/components/GHGIHomePage/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { api } from "@/services/api";

export default function PrivateHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const router = useRouter();

  // Get user info to check if they have default city/inventory
  const { data: userInfo, isLoading: userInfoLoading } =
    api.useGetUserInfoQuery();

  // Handle routing based on user's default city/inventory status
  useEffect(() => {
    if (userInfoLoading) return; // Wait for user info to load

    if (hasFeatureFlag(FeatureFlags.JN_ENABLED)) {
      router.replace(`/${lng}/cities/`);
    } else {
      if (userInfo?.defaultInventoryId) {
        // User has default inventory, render GHGIHomePage for default inventory
        // (no redirect needed, just render the component)
        return;
      } else {
        // User doesn't have default inventory/city, redirect to onboarding
        router.replace(`/${lng}/onboarding`);
      }
    }
  }, [lng, router, userInfo, userInfoLoading]);

  // Show loading state while determining where to redirect
  if (userInfoLoading) {
    return (
      <Box
        h="full"
        display="flex"
        flexDirection="column"
        bg="background.backgroundLight"
      >
        <NavigationBar showMenu lng={lng} />
        <Box p={4}>Loading...</Box>
      </Box>
    );
  }

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar showMenu lng={lng} />
      <HomePage lng={lng} isPublic={false} />
    </Box>
  );
}
