import { RadioGroup as ChakraRadioGroup } from "@chakra-ui/react";
import * as React from "react";

export interface RadioProps extends ChakraRadioGroup.ItemProps {
  rootRef?: React.Ref<HTMLDivElement>;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  /**
   * `filled` — onboarding-style control: unselected `gray.muted`,
   * selected `content.alternative` with `base.light` glyph.
   */
  variant?: "default" | "filled";
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  function Radio(props, ref) {
    const { children, inputProps, rootRef, variant = "default", ...rest } =
      props;

    const indicatorStyles =
      variant === "filled"
        ? {
            mt: "3px",
            flexShrink: 0,
            bg: "gray.muted",
            color: "content.link",
            _checked: {
              color: "base.light",
              backgroundColor: "content.alternative",
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
        <ChakraRadioGroup.ItemIndicator {...indicatorStyles} />
        {children && (
          <ChakraRadioGroup.ItemText>{children}</ChakraRadioGroup.ItemText>
        )}
      </ChakraRadioGroup.Item>
    );
  },
);

export const RadioGroup = ChakraRadioGroup.Root;
