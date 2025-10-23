"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import Footer from "@/components/Sections/Footer";
import { use } from "react";

export default function DataLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar lng={lng} isPublic={true} />
      <Toaster />
      <Box w="full" h="full">
        {props.children}
      </Box>
      <Footer lng={lng} />
    </Box>
  );
}
