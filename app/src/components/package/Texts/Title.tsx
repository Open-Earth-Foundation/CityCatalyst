"use client";

import { Heading, HeadingProps } from "@chakra-ui/react";

export const TitleLarge = ({ children, color = "content.secondary", ...props }: HeadingProps) => (
  <Heading
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="title.lg"
    lineHeight="28px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);

export const TitleMedium = ({ children, color = "content.secondary", ...props }: HeadingProps) => (
  <Heading
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="title.md"
    lineHeight="24px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);

export const TitleSmall = ({ children, color = "content.secondary", ...props }: HeadingProps) => (
  <Heading
    fontFamily="Poppins"
    fontWeight={600}
    fontSize="title.sm"
    lineHeight="20px"
    letterSpacing="0"
    color={color}
    {...props}
  >
    {children}
  </Heading>
);
