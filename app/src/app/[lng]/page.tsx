"use client";
import { use, useEffect } from "react";

import HomePage from "@/components/GHGIHomePage/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

export default function PrivateHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const router = useRouter();

  // If JN is enabled, redirect language root to cities hub client-side as a safety net
  useEffect(() => {
    if (hasFeatureFlag(FeatureFlags.JN_ENABLED)) {
      router.replace(`/${lng}/cities/`);
    }
  }, [lng, router]);

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
