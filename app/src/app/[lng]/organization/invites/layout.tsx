"use client";
import { use } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";

export default function InviteLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  return (
    <Box
      as="main"
      bg="background.backgroundLight"
      className="h-full flex flex-col"
    >
      <Toaster />
      <NavigationBar lng={lng} showNav={false} />
      <Box className="w-full h-full bg-no-repeat px-8">{props.children}</Box>
    </Box>
  );
}
