"use client";
import { Box } from "@chakra-ui/react";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";

/**
 * The screen's ID, as reviewers quote it in the feedback sheet.
 *
 * Deliberately plain: a small pill in the same style the module uses for
 * status, placed at the top of every screen and beside sections that carry
 * their own ID. It is the one piece of demo chrome that must never be
 * mistaken for product UI, so it also carries a title attribute saying so.
 */
export function ScreenTag({ id, title }: { id: string; title: string }) {
  return (
    <Box as="span" title={title} flexShrink={0}>
      <MeedStatusTag tone="info" fontFamily="mono" letterSpacing="0.04em">
        {id}
      </MeedStatusTag>
    </Box>
  );
}
