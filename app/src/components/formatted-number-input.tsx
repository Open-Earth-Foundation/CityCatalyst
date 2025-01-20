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
  localization?: string;
  t: Function;
}

const regionalLocales: Record<string, string> = {
  es: "es-ES", // Spanish (Spain)
  en: "en-US", // English (United States)
  pt: "pt-PT", // Portuguese (Portugal)
  de: "de-DE", // German (Germany)
};

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

  const format = (nval: number | string) => {
    nval = nval.toString();
    const locale = regionalLocales[lng as string] || "en-US"; // Get the user's locale
    const decimalSeparator = (1.1).toLocaleString(locale).substring(1, 2); // Detect the decimal separator

    // Check if the input ends with a decimal separator

    const endsWithSeparator = nval.toString().slice(-1) === decimalSeparator;

    // Replace the locale-specific separator with a dot for parsing
    const normalizedValue = nval.replace(decimalSeparator, ".");

    // Parse the number
    const numericValue = parseFloat(normalizedValue);

    // If the input is not a valid number, return it as is
    if (isNaN(numericValue)) return nval;

    // Format the number part
    const formattedNumber = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 20,
    }).format(numericValue);

    // If the input ends with a separator, add it back to the formatted string
    return endsWithSeparator
      ? `${formattedNumber}${decimalSeparator}`
      : formattedNumber;
  };

  // Parse the formatted string into a raw number
  const parse = (val: string) => {
    const localeDecimalSeparator = (1.1)
      .toLocaleString(regionalLocales[lng as string])
      .substring(1, 2); // Get the decimal separator for the current locale

    const normalizedVal = val.replace(
      new RegExp(`[^0-9${localeDecimalSeparator}-]`, "g"),
      "",
    ); // Keep only numbers and separators
    const normalizedNumber = normalizedVal.replace(localeDecimalSeparator, ".");
    return isNaN(parseFloat(normalizedNumber))
      ? ""
      : normalizedNumber.toString();
  };

  const isCharacterValid = (char: string) => {
    const normalizedLocale = regionalLocales[lng as string] || "en-US"; // Default to en-US
    const decimalSeparator = (1.1)
      .toLocaleString(normalizedLocale)
      .substring(1, 2);

    // Build the regex dynamically to include the decimal separator
    const validRegex = new RegExp(`^[0-9${decimalSeparator}]$`);

    // Check if the character matches the valid regex
    return validRegex.test(char);
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
          if (max && value > max) {
            return t("value-too-high", { max });
          }
        },
      }}
      render={({ field }) => (
        <InputGroup>
          <NumberInput
            ste
            isDisabled={isDisabled}
            value={format(field.value)}
            onChange={(valueAsString) => {
              field.onChange(valueAsString);
            }}
            isValidCharacter={isCharacterValid}
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
