import React from "react";
import { Input, InputProps } from "@chakra-ui/react";
import {
  Control,
  FieldValues,
  Path,
  RegisterOptions,
  useController,
} from "react-hook-form";
import { Field } from "@/components/ui/field";
import { MdError } from "react-icons/md";
import { BodyMedium } from "@/components/Texts/Body";

function useFormattedNumber<TFieldValues extends FieldValues>(
  name: Path<TFieldValues>,
  control: Control<TFieldValues>,
  rules?: Omit<
    RegisterOptions<TFieldValues, Path<TFieldValues>>,
    "valueAsNumber" | "setValueAs"
  >,
) {
  const {
    field: { onChange, value, ref },
    fieldState: { error },
  } = useController({
    name,
    control,
    rules,
    defaultValue: "" as any,
  });

  const formatNumber = (num: number): string => {
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value.replace(/[^\d]/g, "");
    const numberValue = parseInt(rawValue, 10);

    if (!isNaN(numberValue)) {
      onChange(numberValue);
    } else {
      onChange(null);
    }
  };

  const displayValue = typeof value === "number" ? formatNumber(value) : "";

  return {
    onChange: handleChange,
    onBlur: () => {}, // react-hook-form needs this
    value: displayValue,
    name,
    ref,
    error,
  };
}

interface FormattedNumberInputProps<TFieldValues extends FieldValues>
  extends Omit<InputProps, "name"> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  rules?: Omit<
    RegisterOptions<TFieldValues, Path<TFieldValues>>,
    "valueAsNumber" | "setValueAs"
  >;
}

function FormattedNumberInput<TFieldValues extends FieldValues>({
  control,
  name,
  rules,
  ...rest
}: FormattedNumberInputProps<TFieldValues>) {
  const { onChange, value, ref, error } = useFormattedNumber(
    name,
    control,
    rules,
  );
  const errorBgStyle = error ? "sentiment.negativeOverlay" : "inherit";
  return (
    <Field
      invalid={!!error}
      errorText={
        error?.message && (
          <>
            <MdError color="red" />
            <BodyMedium>{error.message}</BodyMedium>
          </>
        )
      }
    >
      <Input
        {...rest}
        onChange={onChange}
        value={value}
        ref={ref}
        type="text"
        bg={errorBgStyle}
        _hover={{
          bg: errorBgStyle,
        }}
        _focus={{
          bg: errorBgStyle,
        }}
      />
    </Field>
  );
}

export default FormattedNumberInput;
