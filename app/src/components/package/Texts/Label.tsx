"use client";

import { Text, TextProps } from "@chakra-ui/react";

interface LabelProps extends TextProps {
  text?: string;
}

export const LabelLarge = ({ text, children, color = "content.secondary", ...props }: LabelProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={500}
    fontSize="label.lg"
    lineHeight="20px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);

export const LabelMedium = ({ text, children, color = "content.secondary", ...props }: LabelProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={500}
    fontSize="label.md"
    lineHeight="16px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);

export const LabelSmall = ({ text, children, color = "content.secondary", ...props }: LabelProps) => (
  <Text
    fontFamily="Poppins"
    fontWeight={500}
    fontSize="label.sm"
    lineHeight="16px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);

export default LabelLarge;
