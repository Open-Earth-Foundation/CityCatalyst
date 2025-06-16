"use client";
import { use } from "react";

import HomePage from "@/components/HomePage/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default function PrivateHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <HomePage lng={lng} isPublic={false} />;
    </Box>
  );
}
