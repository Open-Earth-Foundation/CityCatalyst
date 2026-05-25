import { RadioGroup as ChakraRadioGroup } from "@chakra-ui/react";
import * as React from "react";

export interface RadioProps extends ChakraRadioGroup.ItemProps {
  rootRef?: React.Ref<HTMLDivElement>;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  /** Filled circle: unselected `background.radioUnselected`, selected `content.secondary`. */
  variant?: "default" | "filled";
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  function Radio(props, ref) {
    const { children, inputProps, rootRef, variant = "default", ...rest } =
      props;

    const filledIndicatorStyles =
      variant === "filled"
        ? {
            boxSize: "20px",
            flexShrink: 0,
            borderRadius: "full",
            borderWidth: "5px",
            borderStyle: "solid",
            borderColor: "background.radioUnselected",
            bg: "background.radioUnselected",
            boxSizing: "border-box",
            color: "transparent",
            _checked: {
              bg: "content.secondary",
              borderColor: "background.radioUnselected",
              color: "transparent",
            },
          }
        : {
            color: "content.link",
            borderColor: "content.link",
          };

    return (
      <ChakraRadioGroup.Item
        ref={rootRef}
        gap={variant === "filled" ? "12px" : undefined}
        {...rest}
      >
        <ChakraRadioGroup.ItemHiddenInput ref={ref} {...inputProps} />
        <ChakraRadioGroup.ItemIndicator {...filledIndicatorStyles} />
        {children && (
          <ChakraRadioGroup.ItemText>{children}</ChakraRadioGroup.ItemText>
        )}
      </ChakraRadioGroup.Item>
    );
  },
);

export const RadioGroup = ChakraRadioGroup.Root;
