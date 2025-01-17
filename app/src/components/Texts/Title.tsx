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
    textColor={"content.secondary"}
    {...props}
  >
    {text}
  </Heading>
);
