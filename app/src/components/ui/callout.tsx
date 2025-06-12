import { Box, BoxProps, HStack, Text } from "@chakra-ui/react";
import { MdInfoOutline } from "react-icons/md";
import React from "react";

interface CalloutProps {
  heading?: string;
  description?: string;
}

const Callout = React.forwardRef<BoxProps, CalloutProps & BoxProps>(
  function Callout(
    { heading, description, ...props }: CalloutProps & BoxProps,
    ref: React.ForwardedRef<BoxProps>,
  ) {
    return (
      <Box bg="background.neutral" p={6} borderRadius={3} {...props} ref={ref}>
        <HStack color="content.link">
          <MdInfoOutline />
          <Text
            fontSize={!heading && description ? "body.md" : "label.md"}
            fontWeight="semibold"
            color="content.link"
          >
            {heading || description}
          </Text>
        </HStack>
        {heading && description && (
          <Text
            fontSize="body.small"
            fontWeight="normal"
            color="content.secondary"
          >
            {description}
          </Text>
        )}
      </Box>
    );
  },
);

export default Callout;
