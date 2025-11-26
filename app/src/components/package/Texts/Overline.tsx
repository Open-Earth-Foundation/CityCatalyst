"use client";

import { Text, TextProps } from "@chakra-ui/react";

interface OverlineProps extends TextProps {
  text?: string;
}

export const Overline = ({ text, children, ...props }: OverlineProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="10px"
    lineHeight="16px"
    textTransform="uppercase"
    letterSpacing="1.5px"
    color="content.tertiary"
    {...props}
  >
    {text}
    {children}
  </Text>
);
