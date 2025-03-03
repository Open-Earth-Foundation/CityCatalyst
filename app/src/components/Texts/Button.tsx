import { Text, TextProps } from "@chakra-ui/react";

export const ButtonSmall = (props: TextProps) => (
  <Text
    fontFamily="heading"
    fontSize="button.sm"
    fontWeight="semibold"
    lineHeight="16px"
    color="content.secondary"
    {...props}
  >
    {props.children}
  </Text>
);

export const ButtonMedium = (props: TextProps) => (
  <Text
    fontFamily="heading"
    fontSize="button.md"
    fontWeight="semibold"
    lineHeight="16px"
    color="content.secondary"
    {...props}
  >
    {props.children}
  </Text>
);
