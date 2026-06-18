import { Box, ProgressCircle } from "@chakra-ui/react";
import React from "react";

type ProgressLoaderProps = {
  boxHeight?: string;
  boxWidth?: string;
  size?: "xs" | "sm" | "md" | "lg";
};

const ProgressLoader = ({
  boxHeight = "40vh",
  boxWidth = "100%",
  size = "md",
}: ProgressLoaderProps) => {
  return (
    <Box
      height={boxHeight}
      w={boxWidth}
      display="flex"
      justifyContent="center"
      alignItems="center"
    >
      <ProgressCircle.Root
        value={null}
        size={size}
        color="interactive.secondary"
      >
        <ProgressCircle.Circle>
          <ProgressCircle.Track />
          <ProgressCircle.Range stroke="interactive.secondary" />
        </ProgressCircle.Circle>
      </ProgressCircle.Root>
    </Box>
  );
};

export default ProgressLoader;
