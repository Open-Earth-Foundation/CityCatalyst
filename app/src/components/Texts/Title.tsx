import { Heading, HeadingProps } from "@chakra-ui/react";

interface TitleProps extends HeadingProps {
  text: string;
}

export const TitleLarge = ({ text, ...props }: TitleProps) => (
  <Heading
    fontFamily="heading"
    fontSize="title.lg"
    fontWeight="semibold"
    lineHeight="28"
    color="content.secondary"
    {...props}
  >
    {text}
  </Heading>
);

export const TitleMedium = ({ ...props }: HeadingProps) => (
  <Heading
    fontFamily="heading"
    fontSize="title.md"
    fontWeight="semibold"
    lineHeight="24"
    color="content.secondary"
    {...props}
  >
    {props.children}
  </Heading>
);
