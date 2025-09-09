import { Heading, HeadingProps, Box } from "@chakra-ui/react";

interface HeadlineProps extends HeadingProps {
  text?: string;
}

export const HeadlineSmall = ({ text, children, ...props }: HeadlineProps) => (
  <Heading
    fontFamily="body"
    fontSize="headline.sm"
    fontWeight="semibold"
    lineHeight="32px"
    color="base.dark"
    {...props}
  >
    {text}
    {children}
  </Heading>
);

export const HeadlineMedium = ({
  children,
  className,
  ...props
}: HeadingProps) => (
  <Heading
    fontFamily="heading"
    fontWeight="semibold"
    fontSize="headline.md"
    lineHeight="36"
    className={className ?? "flex items-center justify-center"}
    {...props}
  >
    {children}
  </Heading>
);

export const HeadlineLarge = ({ children, className,...props }: HeadingProps) => (
  <Heading
    fontFamily="heading"
    fontWeight="bold"
    fontSize="headline.lg"
    {...props}
  >
    <Box display="flex" alignItems="center" justifyContent="center">
      {children}
    </Box>
  </Heading>
);
