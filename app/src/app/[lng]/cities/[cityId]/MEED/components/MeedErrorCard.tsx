"use client";
import { Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuRotateCw, LuTriangleAlert } from "react-icons/lu";
import { MeedButton } from "./MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium } from "@/components/package/Texts/Body";
import { FOCUS_RING } from "../focusRing";

export interface MeedErrorCardProps {
  title: string;
  body: string;
  /** Omit both to render a non-retryable notice. */
  retryLabel?: string;
  onRetry?: () => void;
  /**
   * `inline` sits among other content (default). `panel` fills the space where
   * the content would have been — centred, larger icon.
   */
  variant?: "inline" | "panel";
}

/**
 * The module's one "we could not load this" card.
 *
 * Four near-identical copies of this existed (emissions, context, finance,
 * policy), differing only in scale. They were also mostly unreachable, because
 * `MeedGlobalApiService` swallows every upstream failure to `null` and screens
 * render an empty state instead. As the data layer starts distinguishing "no
 * data" from "broken", this becomes the shared surface for the latter.
 */
export function MeedErrorCard({
  title,
  body,
  retryLabel,
  onRetry,
  variant = "inline",
}: MeedErrorCardProps) {
  const isPanel = variant === "panel";
  const retry = retryLabel && onRetry && (
    <MeedButton
      variant="outlined"
      minW="auto"
      px="l"
      mt={isPanel ? "s" : undefined}
      onClick={onRetry}
      leftIcon={isPanel ? <Icon as={LuRotateCw} boxSize="16px" /> : undefined}
      _focusVisible={FOCUS_RING}
    >
      {retryLabel}
    </MeedButton>
  );

  if (isPanel) {
    return (
      <Card.Root borderColor="border.neutral">
        <Card.Body>
          <VStack gap="m" py="xxl" px="l" textAlign="center">
            <Icon
              as={LuTriangleAlert}
              boxSize="32px"
              color="sentiment.negativeDefault"
            />
            <TitleMedium color="content.primary">{title}</TitleMedium>
            <BodyMedium color="content.secondary" maxW="480px">
              {body}
            </BodyMedium>
            {retry}
          </VStack>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <Card.Root borderColor="sentiment.negativeDefault">
      <Card.Body>
        <VStack alignItems="flex-start" gap="m">
          <HStack gap="s">
            <Icon
              as={LuTriangleAlert}
              boxSize="18px"
              color="sentiment.negativeDefault"
            />
            <TitleMedium color="content.primary">{title}</TitleMedium>
          </HStack>
          <BodyMedium color="content.secondary">{body}</BodyMedium>
          {retry}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
