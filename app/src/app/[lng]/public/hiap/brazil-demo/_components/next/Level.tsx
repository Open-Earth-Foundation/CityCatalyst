"use client";
import React from "react";
import { Box, HStack } from "@chakra-ui/react";
import { MeedLevel } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedLevel";
import { MEED_TONE_DOT } from "@/app/[lng]/cities/[cityId]/MEED/components/meedTones";
import { TitleMedium } from "@/components/package/Texts/Title";

/**
 * The demo's level mark is the module's: one dot-and-word component for both,
 * so the proposal screens and MEED never draw a level differently. The demo
 * adds one size, "lg", for a level that is the headline of a box (the
 * financing options), which the module does not need.
 */
export function Level({
  size = "md",
  ...props
}: React.ComponentProps<typeof MeedLevel> & { size?: "md" | "lg" }) {
  if (size !== "lg") return <MeedLevel {...props} />;
  const { tone, children } = props;
  return (
    <HStack gap="s" alignItems="center" data-testid="level">
      <Box
        boxSize="10px"
        borderRadius="full"
        bg={MEED_TONE_DOT[tone]}
        flexShrink={0}
      />
      <TitleMedium as="span" color="content.primary">
        {children}
      </TitleMedium>
    </HStack>
  );
}
