"use client";

import { Text, TextProps } from "@chakra-ui/react";

interface BodyProps extends TextProps {
  text?: string;
}

export const BodyXLarge = ({ text, children, color = "content.tertiary", ...props }: BodyProps) => (
  <Text
    fontFamily="Open Sans"
    fontWeight={400}
    fontSize="body.xl"
    lineHeight="32px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);

export const BodyLarge = ({ text, children, color = "content.tertiary", ...props }: BodyProps) => (
  <Text
    fontFamily="Open Sans"
    fontWeight={400}
    fontSize="body.lg"
    lineHeight="24px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);

export const BodyMedium = ({ text, children, color = "content.tertiary", ...props }: BodyProps) => (
  <Text
    fontFamily="Open Sans"
    fontWeight={400}
    fontSize="body.md"
    lineHeight="20px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);

export const BodySmall = ({ text, children, color = "content.tertiary", ...props }: BodyProps) => (
  <Text
    fontFamily="Open Sans"
    fontWeight={400}
    fontSize="body.sm"
    lineHeight="16px"
    letterSpacing="0.5px"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Text>
);