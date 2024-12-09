import React from "react";
import { Control, Controller, useWatch } from "react-hook-form";
import {
  InputGroup,
  InputRightAddon,
  NumberInput,
  NumberInputField,
  NumberInputProps,
} from "@chakra-ui/react";
import { useParams } from "next/navigation";

interface FormattedNumberInputProps extends NumberInputProps {
  control: Control<any, any>;
  name: string;
  setError?: Function;
  clearErrors?: Function;
  defaultValue?: number;
  isDisabled?: boolean;
  placeholder?: string;
  children?: React.ReactNode;
  id?: string;
  miniAddon?: boolean;
  testId?: string;
  t: Function;
}

function FormattedNumberInput({
  control,
  setError,
  id,
  testId,
  name,
  defaultValue = 0,
  isDisabled = false,
  children,
  placeholder,
  miniAddon,
  clearErrors,
  t,
  min,
  max,
  ...rest
}: FormattedNumberInputProps) {
  const { lng } = useParams();

  const value = useWatch({
    control,
    name,
  });

  // Format the number according to the locale
  const format = (nval: number | string) => {
    let val = parseFloat(nval as string);

    const lastItemDot = nval.toString().slice(-1) === ".";
    if (isNaN(val)) return "";
    return (
      new Intl.NumberFormat(lng, {
        maximumFractionDigits: 20,
      }).format(val) + (lastItemDot ? "." : "")
    );
  };

  // Parse the formatted string into a raw number
  const parse = (val: string) => {
    const localeDecimalSeparator = (1.1).toLocaleString(lng).substring(1, 2); // Get the decimal separator for the current locale
    const normalizedVal = val.replace(
      new RegExp(`[^0-9${localeDecimalSeparator}-]`, "g"),
      "",
    ); // Keep only numbers and separators
    const normalizedNumber = normalizedVal.replace(localeDecimalSeparator, ".");
    return isNaN(parseFloat(normalizedNumber))
      ? ""
      : normalizedNumber.toString();
  };

  return (
    <Controller
      control={control}
      name={name}
      defaultValue={defaultValue}
      rules={{
        required: t("value-required"),
        validate: (value) => {
          if (value === "" || isNaN(value)) {
            return t("value-required");
          }
          if (min && value < min) {
            return t("value-too-low", { min });
          }
          if (max && value >= max) {
            return t("value-too-high", { max });
          }
        },
      }}
      render={({ field }) => (
        <InputGroup>
          <NumberInput
            isDisabled={isDisabled}
            value={format(field.value)}
            onChange={(valueAsString) => {
              const parsedValue = parse(valueAsString);
              field.onChange(parsedValue);
            }}
            onBlur={(e) => {
              e.preventDefault();
              const parsedValue = parse(e.target.value);
              field.onChange(parseFloat(parsedValue));
            }}
            {...rest}
          >
            <NumberInputField
              min={min}
              max={max}
              data-testId={testId}
              placeholder={placeholder}
              h="48px"
              type="text" // Use text type to allow formatted input
              shadow="1dp"
              pr="12px"
              borderRightRadius={children ? 0 : "md"} // Adjust border radius
              bgColor={isDisabled ? "background.neutral" : "base.light"}
              pos="relative"
              zIndex={3}
            />
          </NumberInput>
          {children && (
            <InputRightAddon
              bgColor={isDisabled ? "background.neutral" : "base.light"}
              color="content.tertiary"
              h="48px"
              fontSize="14px"
              shadow="1dp"
              pos="relative"
              zIndex={10}
              pr={2}
              pl={2}
              w={miniAddon ? "100px" : "auto"}
              overflowX={miniAddon ? "hidden" : "visible"}
            >
              {children}
            </InputRightAddon>
          )}
        </InputGroup>
      )}
    />
  );
}

export default FormattedNumberInput;
