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
      {/*
        Borderless cards: white surfaces on the grey page carry a 1dp shadow
        instead of a hairline, and a card inside a card sits on the neutral
        surface so it still reads as a block. A selected top-pick keeps its
        blue border. Scoped here so the product's own screens are untouched.
      */}
      <Box
        w="full"
        h="full"
        css={{
          "& .chakra-card__root:not([data-selected='true'])": {
            borderColor: "transparent",
            boxShadow: "1dp",
          },
          "& .chakra-card__root .chakra-card__root:not([data-selected='true'])":
            {
              boxShadow: "none",
              background: "background.neutral",
            },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
