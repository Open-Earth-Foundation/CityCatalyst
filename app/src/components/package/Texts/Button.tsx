"use client";

import { Text, TextProps } from "@chakra-ui/react";

export const ButtonLarge = ({ color = "content.secondary", ...props }: TextProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="button.lg"
    lineHeight="24px"
    textTransform="uppercase"
    letterSpacing="1.25px"
    color={color}
    {...props}
  >
    {props.children}
  </Text>
);

export const ButtonMedium = ({ color = "content.secondary", ...props }: TextProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="button.md"
    lineHeight="16px"
    textTransform="uppercase"
    letterSpacing="1.25px"
    color={color}
    {...props}
  >
    {props.children}
  </Text>
);

export const ButtonSmall = ({ color = "content.secondary", ...props }: TextProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="button.sm"
    lineHeight="16px"
    textTransform="uppercase"
    letterSpacing="1.25px"
    color={color}
    {...props}
  >
    {props.children}
  </Text>
);
