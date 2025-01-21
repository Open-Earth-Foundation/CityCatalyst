import { Text, TextProps } from "@chakra-ui/react";

interface BodyProps extends TextProps {
  text: string;
}

export const BodyXLarge = ({ text, ...props }: BodyProps) => (
  <Text
    fontFamily="body"
    fontSize="body.xl"
    fontWeight="regular"
    lineHeight="32"
    textColor={"content.tertiary"}
    {...props}
  >
    {text}
  </Text>
);

export const BodyLarge = ({ text, ...props }: BodyProps) => (
  <Text
    fontFamily="body"
    fontSize="body.lg"
    fontWeight="regular"
    lineHeight="24"
    textColor={"content.tertiary"}
    {...props}
  >
    {text}
  </Text>
);

export const BodyMedium = ({ text, ...props }: BodyProps) => (
  <Text
    fontFamily="body"
    fontSize="body.md"
    fontWeight="regular"
    lineHeight="20"
    textColor={"content.tertiary"}
    {...props}
  >
    {text}
  </Text>
);
