"use client";
import { use } from "react";

import HomePage from "@/components/HomePageJN/HomePage";
import { NavigationBar } from "@/components/navigation-bar";
import { VStack } from "@chakra-ui/react";

export default function PrivateHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  return (
    <VStack h="full" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <HomePage lng={lng} isPublic={false} />
    </VStack>
  );
}
