import { Box, BoxProps } from "@chakra-ui/react/box";

interface ColoredCircleProps extends BoxProps {
  color: string;
  size: string;
}
export const ColoredCircle = ({
  color,
  size,
  ...props
}: ColoredCircleProps) => {
  return (
    <Box
      width={size}
      height={size}
      bg={color}
      borderRadius="50%"
      mr={2}
      {...props}
    />
  );
};
