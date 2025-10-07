"use client";

import { Text, TextProps } from "@chakra-ui/react";

interface CaptionProps extends TextProps {
  text?: string;
}

export const Caption = ({ text, children, ...props }: CaptionProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={400}
    fontSize="12px"
    lineHeight="16px"
    letterSpacing="0.5px"
    color="content.tertiary"
    {...props}
  >
    {text}
    {children}
  </Text>
);
