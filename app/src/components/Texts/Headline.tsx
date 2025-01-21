import { Heading, HeadingProps } from "@chakra-ui/react";

interface HeadlineProps extends HeadingProps {
  text: string;
}

export const HeadlineSmall = ({ text, ...props }: HeadlineProps) => (
  <Heading
    fontFamily="body"
    fontSize="headline.sm"
    fontWeight="semibold"
    lineHeight="32px"
    textColor={"base.dark"}
    {...props}
  >
    {text}
  </Heading>
);
