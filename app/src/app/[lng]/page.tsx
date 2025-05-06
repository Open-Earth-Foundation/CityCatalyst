"use client";

import HomePage from "@/components/HomePage/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default function PrivateHome({
  params: { lng },
}: {
  params: { lng: string };
}) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <HomePage lng={lng} isPublic={false} />;
    </Box>
  );
}
