import { Button as ChakraButton, ButtonProps as ChakraButtonProps } from '@chakra-ui/react';
import { forwardRef } from 'react';
import { ButtonMedium } from "../Texts/Button";

export type CCTerraButtonVariant = "filled" | "outlined" | "text";
export type CCTerraButtonStatus = "default" | "active";

export interface CCTerraButtonProps extends Omit<ChakraButtonProps, "variant"> {
  variant?: CCTerraButtonVariant;
  status?: CCTerraButtonStatus;
  isError?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const filledStyles = {
  default: {
    bg: "#2351dc",
    color: "#fff",
    _hover: { bg: "#1d3fa6" },
    _active: { bg: "#001ea7" },
    border: "none",
    boxShadow: "none",
  },
  active: {
    bg: "#2351dc",
    color: "#fff",
    border: "1px solid #001ea7",
    boxShadow:
      "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -2px rgba(0,0,0,0.1)",
  },
};

const outlinedStyles = {
  default: {
    bg: "transparent",
    color: "#2351dc",
    border: "2px solid #2351dc",
    _hover: { bg: "#e8eafb" },
    _active: { bg: "#e8eafb" },
    boxShadow: "none",
  },
  active: {
    bg: "#e8eafb",
    color: "#2351dc",
    border: "2px solid #2351dc",
    boxShadow:
      "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -2px rgba(0,0,0,0.1)",
  },
};

const textStyles = {
  default: {
    bg: "transparent",
    color: "#2351dc",
    border: "none",
    _hover: { textDecoration: "underline" },
    _active: { textDecoration: "underline" },
    boxShadow: "none",
  },
  active: {
    bg: "transparent",
    color: "#2351dc",
    border: "none",
    textDecoration: "underline",
    boxShadow: "none",
  },
};

const errorStyles = {
  outlined: {
    bg: "transparent",
    color: "#F23D33",
    border: "2px solid #F23D33",
    _hover: { bg: "#fff5f4" },
    _active: { bg: "#fff5f4" },
    boxShadow: "none",
  },
  filled: {
    bg: "#F23D33",
    color: "#fff",
    border: "none",
    _hover: { bg: "#d32f2f" },
    _active: { bg: "#b71c1c" },
    boxShadow: "none",
  },
  text: {
    bg: "transparent",
    color: "#F23D33",
    border: "none",
    _hover: { textDecoration: "underline" },
    _active: { textDecoration: "underline" },
    boxShadow: "none",
  },
};

const getButtonStyles = (variant: CCTerraButtonVariant, isError?: boolean) => {
  if (isError) return errorStyles[variant];
  if (variant === "filled") return filledStyles.default;
  if (variant === "outlined") return outlinedStyles.default;
  return textStyles.default;
};

export const CCTerraButton = forwardRef<HTMLButtonElement, CCTerraButtonProps>(
  (
    {
      variant = "filled",
      isError = false,
      leftIcon,
      rightIcon,
      children,
      ...rest
    },
    ref,
  ) => {
    const styles = getButtonStyles(variant, isError);
    return (
      <ChakraButton
        ref={ref}
        borderRadius="100px"
        px="24px"
        py="16px"
        minW="172px"
        h="48px"
        display="flex"
        alignItems="center"
        gap="8px"
        {...styles}
        {...rest}
      >
        {leftIcon && (
          <span style={{ display: "flex", alignItems: "center" }}>
            {leftIcon}
          </span>
        )}
        <ButtonMedium color="inherit">{children}</ButtonMedium>
        {rightIcon && (
          <span style={{ display: "flex", alignItems: "center" }}>
            {rightIcon}
          </span>
        )}
      </ChakraButton>
    );
  },
);

CCTerraButton.displayName = 'CCTerraButton';
