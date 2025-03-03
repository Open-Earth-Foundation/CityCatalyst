import { Text, TextProps } from "@chakra-ui/react";

interface BodyProps extends TextProps {
  text?: string;
}

export const BodyXLarge = ({ text, ...props }: BodyProps) => (
  <Text
    fontFamily="body"
    fontSize="body.xl"
    fontWeight="regular"
    lineHeight="32"
    color="content.tertiary"
    {...props}
  >
    {text}
    {props.children}
  </Text>
);

export const BodyLarge = ({ text, ...props }: BodyProps) => (
  <Text
    fontFamily="body"
    fontSize="body.lg"
    fontWeight="regular"
    lineHeight="24"
    color="content.tertiary"
    {...props}
  >
    {text}
    {props.children}
  </Text>
);

export const BodyMedium = ({ text, children, ...props }: BodyProps) => (
  <Text
    fontFamily="body"
    fontSize="body.md"
    fontWeight="regular"
    lineHeight="20"
    color="content.tertiary"
    {...props}
  >
    {text}
    {children}
  </Text>
);
