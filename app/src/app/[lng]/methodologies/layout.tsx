"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import Footer from "@/components/Sections/Footer";
import React from "react";

export default function MethodologiesLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar lng={lng} />
      <Toaster />
      <div className="w-full h-full">{children}</div>
      <Footer lng={lng} />
    </Box>
  );
}
