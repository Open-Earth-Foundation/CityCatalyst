"use client";
import React from "react";
import { Box, Collapsible, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";

/**
 * One row of a proposal list that opens on its detail: the pattern the
 * reviewers liked on policy alignment, used for risk, legal, finance and
 * policy alike. Each row is its own card: the name as a title, one meta line,
 * the row's level on the right, and the detail below a divider when open.
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
      bg="base.light"
      borderWidth="1px"
      borderColor={open ? "content.link" : "border.neutral"}
      borderRadius="rounded"
      boxShadow="1dp"
      overflow="hidden"
      transition="box-shadow 0.15s, border-color 0.15s"
      _hover={{ boxShadow: "2dp" }}
    >
      <Collapsible.Trigger asChild>
        <Box
          as="button"
          id={id}
          w="full"
          textAlign="start"
          px="xl"
          py="l"
          scrollMarginTop="96px"
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
                <TitleMedium as="span" color="content.primary">
                  {title}
                </TitleMedium>
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
        <Box px="xl" py="l" borderTopWidth="1px" borderColor="border.overlay">
          {children}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/** The rows, each its own card, with room between them. */
export function RowList({ children }: { children: React.ReactNode }) {
  return (
    <VStack alignItems="stretch" gap="m">
      {children}
    </VStack>
  );
}
