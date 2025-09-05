import { Text, TextProps } from "@chakra-ui/react";

interface LabelProps extends TextProps {
  text?: string;
}

export const LabelLarge = ({ text, children, ...props }: LabelProps) => (
  <Text
    fontSize="label.lg"
    fontWeight="medium"
    fontStyle="normal"
    fontFamily="heading"
    lineHeight="20px"
    letterSpacing="wide"
    color="content.secondary"
    {...props}
  >
    {text}
    {children}
  </Text>
);

export const LabelMedium = ({ text, children, ...props }: LabelProps) => (
  <Text
    fontSize="label.md"
    fontWeight="medium"
    fontStyle="normal"
    fontFamily="heading"
    lineHeight="20px"
    letterSpacing="wide"
    color="content.secondary"
    {...props}
  >
    {text}
    {children}
  </Text>
);

export default LabelLarge;
