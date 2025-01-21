import { Heading, HeadingProps } from "@chakra-ui/react";

interface DisplayProps extends HeadingProps {
  text: string;
}

export const DisplaySmall = ({ text, ...props }: DisplayProps) => (
  <Heading
    as="h1"
    color="content.alternative"
    fontSize="display.sm"
    lineHeight="44px"
    fontWeight="600"
    fontStyle="normal"
    {...props}
  >
    {text}
  </Heading>
);
