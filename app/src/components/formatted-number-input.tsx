import React, { useCallback, useLayoutEffect, useRef } from "react";
import { Control, Controller } from "react-hook-form";
import { Group, Input, InputAddon } from "@chakra-ui/react";
import { NumberInputProps } from "./ui/number-input";
import { decimalSeparators, formatNumber } from "@/util/helpers";
import { NumberFormatEnum } from "@/util/enums";

interface FormattedNumberInputProps extends NumberInputProps {
  control: Control<any, any>;
  name: string;
  setError?: Function;
  clearErrors?: Function;
  defaultValue?: string | undefined;
  isDisabled?: boolean;
  placeholder?: string;
  children?: React.ReactNode;
  id?: string;
  miniAddon?: boolean;
  testId?: string;
  localization?: string;
  t: Function;
  max?: number;
  min?: number;
  numberFormat?: string;
}

/**
 * Count how many group (thousands) separator characters appear in `str`
 * up to position `pos`. Group separators are any character that is not
 * a digit, not the decimal separator, and not a minus sign.
 */
function countSeparatorsBefore(
  str: string,
  pos: number,
  decimalSep: string,
): number {
  let count = 0;
  for (let i = 0; i < pos && i < str.length; i++) {
    const ch = str[i];
    if (ch !== decimalSep && ch !== "-" && !/\d/.test(ch)) {
      count++;
    }
  }
  return count;
}

function FormattedNumberInput({
  control,
  setError,
  id,
  testId,
  name,
  defaultValue = "0",
  isDisabled = false,
  children,
  placeholder,
  miniAddon,
  clearErrors,
  t,
  min,
  max,
  numberFormat,
  ...rest
}: FormattedNumberInputProps) {
  const normalizedFormat = numberFormat ?? NumberFormatEnum.COMMA_AND_DOT;
  const decimalSeparator = decimalSeparators[normalizedFormat];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCursorRef = useRef<number | null>(null);

  const format = useCallback(
    (nval: number | string) => {
      if (nval == null || nval === "") return "";
      nval = nval.toString();

      // Check if the input ends with a decimal separator
      const endsWithSeparator = nval.toString().slice(-1) === decimalSeparator;

      // Replace the locale-specific separator with a dot for parsing
      const normalizedValue = nval.replace(decimalSeparator, ".");

      // Parse the number
      const numericValue = parseFloat(normalizedValue);

      // If the input is not a valid number, return it as is
      if (isNaN(numericValue)) return nval;

      // Format the number part
      const formattedNumber = formatNumber(numericValue, numberFormat, 20);

      // If the input ends with a separator, add it back to the formatted string
      return endsWithSeparator
        ? `${formattedNumber}${decimalSeparator}`
        : formattedNumber;
    },
    [decimalSeparator, numberFormat],
  );

  // Parse the formatted string into a raw number
  const parse = useCallback(
    (val: string) => {
      const normalizedVal = val.replace(
        new RegExp(`[^0-9${decimalSeparator}-]`, "g"),
        "",
      ); // Keep only numbers and separators
      const normalizedNumber = normalizedVal.replace(decimalSeparator, ".");
      return isNaN(parseFloat(normalizedNumber))
        ? ""
        : normalizedNumber.toString();
    },
    [decimalSeparator],
  );

  // Restore cursor position synchronously after DOM updates
  useLayoutEffect(() => {
    if (pendingCursorRef.current != null && inputRef.current) {
      const pos = pendingCursorRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      pendingCursorRef.current = null;
    }
  });

  /**
   * Handle input changes while preserving cursor position.
   * We compute the new cursor position by comparing separator counts
   * in the old vs new formatted strings.
   */
  const handleChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      fieldOnChange: (v: any) => void,
    ) => {
      const input = e.target;
      const oldValue = input.value;
      const cursorPos = input.selectionStart ?? oldValue.length;

      const parsedValue = parse(oldValue);

      // Compute what the new formatted value will be
      const newFormatted = format(parsedValue);

      // Count separators before cursor in old vs new string
      const oldSeps = countSeparatorsBefore(
        oldValue,
        cursorPos,
        decimalSeparator,
      );
      const newSeps = countSeparatorsBefore(
        newFormatted,
        cursorPos + (newFormatted.length - oldValue.length),
        decimalSeparator,
      );

      // Adjust cursor: shift by the difference in separator count
      const newCursorPos = Math.max(
        0,
        Math.min(cursorPos + (newSeps - oldSeps), newFormatted.length),
      );

      // Store the desired cursor position for useLayoutEffect to apply
      pendingCursorRef.current = newCursorPos;

      fieldOnChange(parsedValue);
    },
    [parse, format, decimalSeparator],
  );

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
          if (min != null && value < min) {
            return t("value-too-low", { min });
          }
          if (max != null && value > max) {
            return t("value-too-high", { max });
          }
        },
      }}
      render={({ field }) => {
        const formatted = format(field.value);
        return (
          <Group w="full">
            <Input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              disabled={isDisabled}
              value={formatted}
              data-testid={testId}
              onChange={(e) => handleChange(e, field.onChange)}
              onBlur={(e) => {
                e.preventDefault();
                const parsedValue = parse(e.target.value);
                field.onChange(parseFloat(parsedValue));
              }}
              placeholder={placeholder}
              shadow="1dp"
              w="full"
              borderRightRadius={children ? 0 : "md"}
              bgColor={isDisabled ? "background.neutral" : "base.light"}
              pos="relative"
              zIndex={3}
            />
            {children && (
              <InputAddon
                bgColor={isDisabled ? "background.neutral" : "base.light"}
                color="content.tertiary"
                h="40px"
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
              </InputAddon>
            )}
          </Group>
        );
      }}
    />
  );
}

export default FormattedNumberInput;
