"use client";
import { Box } from "@chakra-ui/react";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { DemoBanner } from "./DemoBanner";

/**
 * Same chrome as the other public routes (`public/cities/layout.tsx`): the
 * public navigation bar — which already carries the language selector, so
 * EN/PT switching costs nothing — plus the demo banner.
 */
export function DemoLayoutClient({
  lng,
  children,
}: {
  lng: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar lng={lng} isPublic={true} />
      <DemoBanner lng={lng} />
      <Toaster />
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
