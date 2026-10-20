"use client";
import React from "react";
import { Box, Card, Collapsible, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";

/**
 * One row of a proposal list that opens on its detail: the pattern the
 * reviewers liked on policy alignment, used for risk, legal, finance and
 * policy alike. Title and one meta line on the left, the row's level on the
 * right, the detail on a tinted panel below.
 */
export function ExpandableRow({
  id,
  open,
  onOpenChange,
  title,
  meta,
  aside,
  children,
}: {
  /** Anchor id, so other screens can link to the row. */
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** The row's level(s), right-aligned on wide screens, below on narrow. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      data-testid="expandable-row"
    >
      <Collapsible.Trigger asChild>
        <Box
          as="button"
          id={id}
          w="full"
          textAlign="start"
          px="l"
          py="m"
          borderBottomWidth="1px"
          borderColor="border.overlay"
          scrollMarginTop="96px"
          _hover={{ bg: "background.neutral" }}
          _focusVisible={FOCUS_RING}
        >
          <HStack justifyContent="space-between" gap="m" alignItems="center">
            {/* Stacked below lg, side by side above: every row the same shape. */}
            <Box
              flex="1"
              minW={0}
              display="flex"
              flexDirection={{ base: "column", lg: "row" }}
              alignItems={{ base: "flex-start", lg: "center" }}
              justifyContent="space-between"
              gap={{ base: "s", lg: "l" }}
            >
              <VStack alignItems="flex-start" gap="xs" minW={0} flex="1">
                <LabelLarge color="content.primary">{title}</LabelLarge>
                {meta && (
                  <BodySmall as="div" color="content.tertiary">
                    {meta}
                  </BodySmall>
                )}
              </VStack>
              {aside && (
                <HStack gap="l" flexWrap="wrap" flexShrink={0}>
                  {aside}
                </HStack>
              )}
            </Box>
            <Icon
              as={open ? LuChevronUp : LuChevronDown}
              boxSize="16px"
              color="content.tertiary"
              flexShrink={0}
            />
          </HStack>
        </Box>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Box
          px="l"
          py="l"
          bg="background.neutral"
          borderBottomWidth="1px"
          borderColor="border.overlay"
        >
          {children}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/** The card the rows sit in. */
export function RowList({ children }: { children: React.ReactNode }) {
  return (
    <Card.Root overflow="hidden" borderColor="border.neutral">
      <VStack alignItems="stretch" gap="0">
        {children}
      </VStack>
    </Card.Root>
  );
}
