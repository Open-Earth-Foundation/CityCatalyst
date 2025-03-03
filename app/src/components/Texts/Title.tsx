import { Heading, HeadingProps } from "@chakra-ui/react";

export const TitleLarge = ({ children, ...props }: HeadingProps) => (
  <Heading
    fontFamily="heading"
    fontSize="title.lg"
    fontWeight="semibold"
    lineHeight="28"
    color="content.secondary"
    {...props}
  >
    {children}
  </Heading>
);

export const TitleMedium = ({ children, ...props }: HeadingProps) => (
  <Heading
    fontFamily="heading"
    fontSize="title.md"
    fontWeight="semibold"
    lineHeight="24"
    color="content.secondary"
    {...props}
  >
    {children}
  </Heading>
);

export const TitleSmall = ({ children, ...props }: HeadingProps) => (
  <Heading
    fontFamily="heading"
    fontSize="title.sm"
    fontWeight="semibold"
    lineHeight="16px"
    color="content.secondary"
    {...props}
  >
    {children}
  </Heading>
);
