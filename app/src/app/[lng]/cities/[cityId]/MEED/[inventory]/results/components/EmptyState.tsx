"use client";
import React from "react";
import { Card, Icon, VStack } from "@chakra-ui/react";
import { LuInbox } from "react-icons/lu";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium } from "@/components/package/Texts/Body";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";

/**
 * Precondition / no-data state for the results screen: shown while no
 * prioritization ranking exists for this inventory yet.
 */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card.Root>
      <Card.Body>
        <VStack gap="12px" py="48px" px="24px" textAlign="center">
          <Icon as={LuInbox} boxSize="32px" color="content.tertiary" />
          <TitleMedium color="content.primary">{title}</TitleMedium>
          <BodyMedium color="content.secondary" maxW="480px">
            {body}
          </BodyMedium>
          {actionLabel && onAction && (
            <CCTerraButton mt="12px" variant="filled" onClick={onAction}>
              {actionLabel}
            </CCTerraButton>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
