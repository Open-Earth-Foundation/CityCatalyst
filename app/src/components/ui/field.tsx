import { Field as ChakraField } from "@chakra-ui/react";
import * as React from "react";
import { InfoTip } from "@/components/ui/tooltips";

export interface FieldProps extends Omit<ChakraField.RootProps, "label"> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  optionalText?: React.ReactNode;
  labelColor?: string;
  labelClassName?: string;
  labelInfo?: string;
  truncateLabel?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  function Field(props, ref) {
    const {
      label,
      labelInfo,
      children,
      helperText,
      errorText,
      optionalText,
      labelColor = "content.tertiary",
      labelClassName,
      truncateLabel = false,
      ...rest
    } = props;
    return (
      <ChakraField.Root ref={ref} {...rest}>
        {label && (
          <ChakraField.Label
            truncate={truncateLabel}
            className={labelClassName}
            color={labelColor}
          >
            {label}
            {labelInfo && <InfoTip content={labelInfo} />}
            <ChakraField.RequiredIndicator fallback={optionalText} />
          </ChakraField.Label>
        )}
        {children}
        {helperText && (
          <ChakraField.HelperText>{helperText}</ChakraField.HelperText>
        )}
        {errorText && (
          <ChakraField.ErrorText>{errorText}</ChakraField.ErrorText>
        )}
      </ChakraField.Root>
    );
  },
);
