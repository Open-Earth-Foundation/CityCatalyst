import { Box, Flex } from "@chakra-ui/react";
import React from "react";

function MinimalStepperItem({ isEnabled }: { isEnabled: boolean }) {
  return (
    <Box
      flex={"1"}
      height={"8px"}
      backgroundColor={
        isEnabled ? "interactive.secondary" : "background.neutral"
      }
      borderRadius={"full"}
    />
  );
}

export default function MinimalStepper({ step }: { step: number }) {
  return (
    <Flex
      my={"5px"}
      align={"center"}
      justifyContent="space-between"
      width="100%"
      gap="4px"
    >
      <MinimalStepperItem isEnabled={step >= 1} />
      <MinimalStepperItem isEnabled={step >= 2} />
      <MinimalStepperItem isEnabled={step >= 3} />
    </Flex>
  );
}
