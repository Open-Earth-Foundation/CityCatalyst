import { Text, TextProps } from "@chakra-ui/react";

interface LabelLargeProps extends TextProps {
  text: string;
}

const LabelLarge = ({ text, ...props }: LabelLargeProps) => (
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
  </Text>
);

export default LabelLarge;
