"use client";
import { use, useEffect } from "react";

import HomePage from "@/components/GHGIHomePage/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";

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

  // Get the user's projects to decide between the Journey Navigator and the
  // All Projects view for multi-project users
  const { data: projects, isLoading: projectsLoading } =
    api.useGetUserProjectsQuery({});

  // Handle routing based on user's default city/inventory status
  useEffect(() => {
    if (userInfoLoading || projectsLoading) return; // Wait for user info and projects to load
    // RTK Query reports isLoading: false for a not-yet-initiated query on the
    // first render, before its fetch has actually been dispatched, so also
    // wait for the projects data itself to arrive before deciding.
    if (!projects) return;

    // Don't redirect to onboarding if there was an API error (e.g., rate limiting)
    // The user should stay on the current page and retry
    if (isError) return;

    if (projects.length > 1) {
      const organizationId = projects.find(
        (project) => project.organizationId,
      )?.organizationId;
      if (organizationId) {
        router.replace(`/${lng}/organization/${organizationId}/project`);
        return;
      }
    }

    router.replace(`/${lng}/cities/`);
  }, [lng, router, userInfo, userInfoLoading, isError, projects, projectsLoading]);

  // Only render the (deprecated) fallback home page when there was an error
  // fetching user info, so the user has something to retry from. In every
  // other case a redirect is either pending or about to be dispatched by the
  // effect above, so keep showing the loading state — otherwise this page
  // briefly mounts, and its own onboarding-redirect effects race the
  // redirect above.
  if (!userInfoLoading && !projectsLoading && isError) {
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
