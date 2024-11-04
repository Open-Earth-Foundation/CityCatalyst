"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default function AuthLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <Box
      as="main"
      bg="background.backgroundLight"
      className="h-full flex flex-col"
    >
      <NavigationBar lng={lng} showNav={false} />
      <Box className="w-full h-full bg-left-bottom bg-no-repeat px-8">
        {children}
      </Box>
    </Box>
  );
}
