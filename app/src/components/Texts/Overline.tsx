import { Text } from "@chakra-ui/react";

export const Overline = ({ ...props }) => (
  <Text
    color="content.tertiary"
    fontWeight="extrabold"
    lineHeight="16px"
    letterSpacing="widest"
    fontSize="overline"
    fontFamily="heading"
    {...props}
  />
);
