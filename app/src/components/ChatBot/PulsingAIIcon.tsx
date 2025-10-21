import React from "react";
import { Box, Icon } from "@chakra-ui/react";
import { BsStars } from "react-icons/bs";

interface PulsingAIIconProps {
  size?: number;
}

export function PulsingAIIcon({ size = 9 }: PulsingAIIconProps) {
  return (
    <Box
      w={size}
      h={size}
      p={2}
      borderRadius="full"
      bg="content.alternative"
      display="flex"
      alignItems="center"
      justifyContent="center"
      animationName="pulse"
      animationDuration="1.5s"
      animationTimingFunction="ease-in-out"
      animationIterationCount="infinite"
    >
      <Icon as={BsStars} boxSize={5} color="base.light" />
    </Box>
  );
}