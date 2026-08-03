"use client";
import { use, useEffect } from "react";

import HomePage from "@/components/GHGIHomePage/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";

/** @deprecated has been replaced with GHGI module home page */
export default function PrivateHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const router = useRouter();

  // Get user info to check if they have default city/inventory
  const {
    data: userInfo,
    isLoading: userInfoLoading,
    isError,
  } = api.useGetUserInfoQuery();

  // Handle routing based on user's default city/inventory status
  useEffect(() => {
    if (userInfoLoading) return; // Wait for user info to load

    // Don't redirect to onboarding if there was an API error (e.g., rate limiting)
    // The user should stay on the current page and retry
    if (isError) return;

    router.replace(`/${lng}/cities/`);
  }, [lng, router, userInfo, userInfoLoading, isError]);

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
        <ProgressLoader />
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
