"use client";
import React from "react";
import { Box, HStack, Icon } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import type { TFunction } from "i18next";
import { MEED_WIZARD_STEPS, getMeedPath } from "./steps";

interface MeedStepBarProps {
  activeStep: number;
  lng: string;
  cityId: string;
  inventoryId: string;
  t: TFunction;
}

export function MeedStepBar({
  activeStep,
  lng,
  cityId,
  inventoryId,
  t,
}: MeedStepBarProps) {
  const router = useRouter();

  return (
    <HStack
      w="full"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="divider.neutral"
      overflowX="auto"
      gap={0}
    >
      {MEED_WIZARD_STEPS.map((step, i) => {
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        const isClickable = !isActive;

        return (
          <Box
            key={step.key}
            px="20px"
            py="10px"
            fontSize="xs"
            whiteSpace="nowrap"
            flexShrink={0}
            display="flex"
            alignItems="center"
            gap="4px"
            cursor={isClickable ? "pointer" : "default"}
            borderBottomWidth="2px"
            borderBottomColor={isActive ? "content.link" : "transparent"}
            color={
              isActive
                ? "content.link"
                : isDone
                  ? "sentiment.positiveDefault"
                  : "content.tertiary"
            }
            fontWeight={isActive ? "semibold" : "normal"}
            _hover={isClickable ? { color: "content.link" } : undefined}
            onClick={() => {
              if (isClickable) {
                router.push(getMeedPath(lng, cityId, inventoryId, step.segment));
              }
            }}
          >
            {isDone && <Icon as={LuCheck} boxSize="12px" />}
            <span>
              {i + 1}. {t(step.labelKey)}
            </span>
          </Box>
        );
      })}
    </HStack>
  );
}
