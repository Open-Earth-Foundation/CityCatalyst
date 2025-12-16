import { Box, ProgressCircle } from "@chakra-ui/react";
import React from "react";

const ProgressLoader = () => {
  return (
    <Box
      height="40vh"
      w="100%"
      display="flex"
      justifyContent="center"
      alignItems="center"
    >
      <ProgressCircle.Root value={null} size="md" color="interactive.secondary">
        <ProgressCircle.Circle>
          <ProgressCircle.Track />
          <ProgressCircle.Range stroke="interactive.secondary" />
        </ProgressCircle.Circle>
      </ProgressCircle.Root>
    </Box>
  );
};

export default ProgressLoader;
