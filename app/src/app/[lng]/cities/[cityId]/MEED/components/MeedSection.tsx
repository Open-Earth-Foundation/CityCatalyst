"use client";
import React from "react";
import { VStack } from "@chakra-ui/react";
import { TitleLarge } from "@/components/package/Texts/Title";
import { BodyMedium } from "@/components/package/Texts/Body";

/**
 * The one section frame of the MEED screens: a title, an optional one-line
 * intro, then the content. Title to intro is a hair apart; heading block to
 * content is one step; the page puts sections well apart. Every section on a
 * screen uses this, so the rhythm never depends on which component sits
 * inside.
 */
export const MeedSection = React.forwardRef<
  HTMLDivElement,
  {
    id?: string;
    title: string;
    body?: string;
    children: React.ReactNode;
  }
>(function MeedSection({ id, title, body, children }, ref) {
  return (
    <VStack
      ref={ref}
      id={id}
      as="section"
      alignItems="stretch"
      gap="l"
      scrollMarginTop="l"
    >
      <VStack alignItems="stretch" gap="xs">
        <TitleLarge as="h2" color="content.primary">
          {title}
        </TitleLarge>
        {body && <BodyMedium color="content.secondary">{body}</BodyMedium>}
      </VStack>
      {children}
    </VStack>
  );
});
