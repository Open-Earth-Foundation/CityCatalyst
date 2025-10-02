"use client";

import { Heading, HeadingProps } from "@chakra-ui/react";

interface HeadlineProps extends HeadingProps {
  text?: string;
}

export const HeadlineSmall = ({ text, children, color = "base.dark", ...props }: HeadlineProps) => (
  <Heading
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="headline.sm"
    lineHeight="32px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Heading>
);

export const HeadlineMedium = ({ children, color = "base.dark", ...props }: HeadingProps) => (
  <Heading
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="headline.md"
    lineHeight="36px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);

export const HeadlineLarge = ({ children, color = "base.dark", ...props }: HeadingProps) => (
  <Heading
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="headline.lg"
    lineHeight="40px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);
