"use client";

import { Heading, HeadingProps } from "@chakra-ui/react";

interface DisplayProps extends HeadingProps {
  text?: string;
}

export const DisplaySmall = ({ text, children, color = "content.alternative", ...props }: DisplayProps) => (
  <Heading
    as="h1"
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="display.sm"
    lineHeight="44px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {text}
    {children}
  </Heading>
);

export const DisplayMedium = ({ children, color = "content.alternative", ...props }: HeadingProps) => (
  <Heading
    as="h1"
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="display.md"
    lineHeight="52px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);

export const DisplayLarge = ({ children, color = "content.alternative", ...props }: HeadingProps) => (
  <Heading
    as="h1"
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="display.lg"
    lineHeight="64px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);
