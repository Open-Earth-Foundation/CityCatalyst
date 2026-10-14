"use client";

import { chakra, Icon } from "@chakra-ui/react";
import {
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
} from "react";
import type { Components, ExtraProps } from "react-markdown";
import { LuCircleAlert } from "react-icons/lu";

import { Tooltip } from "@/components/ui/tooltip";
import {
  decodeMissingInformationMessage,
  missingInformationRanges,
  MISSING_INFORMATION_LINK,
} from "./draft-markdown";

const MARKER_PREFIX = /^information needed:\s*/i;

/** Short inline label so a gap reads as text, not as a bare icon; the full
 * message stays in the tooltip. */
export function markerLabel(message: string): string {
  const body = message.replace(MARKER_PREFIX, "").trim();
  return body.length > 72 ? `${body.slice(0, 69).trimEnd()}…` : body;
}

function MissingInformationMarker({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      showArrow
      portalled
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      closeOnClick={false}
      content={message}
      contentProps={{
        maxW: "360px",
        px: 3,
        py: 2,
        fontSize: "label.sm",
        lineHeight: "20px",
      }}
    >
      <chakra.button
        type="button"
        data-testid="concept-note-missing-information"
        data-review-decoration="true"
        aria-label={message}
        display="inline-flex"
        alignItems="center"
        gap={1}
        maxW="100%"
        minH="18px"
        px={1.5}
        py="1px"
        mx={1}
        borderRadius="full"
        border="1px solid"
        borderColor="sentiment.warningDefault/50"
        bg="sentiment.warningOverlay"
        color="sentiment.warningDefault"
        fontSize="11px"
        lineHeight="16px"
        fontWeight="medium"
        textAlign="left"
        verticalAlign="text-bottom"
        cursor="pointer"
        onClick={() => setOpen(!open)}
        _hover={{ bg: "sentiment.warningOverlay" }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "content.link",
          outlineOffset: "1px",
        }}
      >
        <Icon as={LuCircleAlert} boxSize="12px" flexShrink={0} />
        <chakra.span
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          data-testid="concept-note-missing-information-label"
        >
          {markerLabel(message)}
        </chakra.span>
      </chakra.button>
    </Tooltip>
  );
}

/** Render missing-information markers as inspectable tooltips. */
export function missingInformationComponents(
  components: Components,
): Components {
  const Link = (components.a ?? "a") as ElementType<
    ComponentPropsWithoutRef<"a"> & ExtraProps
  >;
  return {
    ...components,
    a: ({ children, href, title, ...props }) => {
      const message =
        href === MISSING_INFORMATION_LINK
          ? decodeMissingInformationMessage(title)
          : null;
      return message ? (
        <MissingInformationMarker message={message} />
      ) : (
        <Link {...props} href={href} title={title}>
          {children}
        </Link>
      );
    },
  };
}

/** Inline diff fragments remain literal text, apart from complete marker controls. */
export function MissingInformationText({ text }: { text: string }) {
  const ranges = missingInformationRanges(text);
  const children = ranges.flatMap((range, index) => {
    const prefix = text.slice(ranges[index - 1]?.end ?? 0, range.start);
    return [
      prefix,
      <MissingInformationMarker key={range.start} message={range.message} />,
    ];
  });
  return (
    <>
      {children}
      {text.slice(ranges[ranges.length - 1]?.end ?? 0)}
    </>
  );
}
