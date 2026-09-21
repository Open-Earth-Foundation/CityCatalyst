"use client";
import { HStack, Icon, Link as ChakraLink } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuChevronRight } from "react-icons/lu";
import { Overline } from "@/components/package/Texts/Overline";
import { FOCUS_RING } from "../focusRing";

export interface MeedCrumb {
  label: string;
  /** Omit on the final crumb — you are already there. */
  href?: string;
}

/**
 * The module's location trail, shared by the landing screen and every step.
 *
 * Strictly locations, never actions. An earlier version read
 * "Back to overview › Pre-flight check", which mixed a command with a place and
 * left the user unable to tell what the trail was describing. Going back is the
 * job of the footer button and the stepper; this only says where you are.
 */
export function MeedBreadcrumb({ crumbs }: { crumbs: MeedCrumb[] }) {
  return (
    <HStack
      as="nav"
      gap="xs"
      color="content.tertiary"
      flexWrap="wrap"
      aria-label="Breadcrumb"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <HStack key={`${crumb.label}-${index}`} gap="xs">
            {crumb.href && !isLast ? (
              <ChakraLink
                asChild
                color="content.tertiary"
                textDecoration="underline"
                _hover={{ color: "content.link" }}
                _focusVisible={FOCUS_RING}
              >
                <NextLink href={crumb.href}>
                  <Overline>{crumb.label}</Overline>
                </NextLink>
              </ChakraLink>
            ) : (
              <Overline
                color={isLast ? "content.secondary" : "content.tertiary"}
                aria-current={isLast ? "page" : undefined}
              >
                {crumb.label}
              </Overline>
            )}
            {!isLast && <Icon as={LuChevronRight} boxSize="12px" />}
          </HStack>
        );
      })}
    </HStack>
  );
}
