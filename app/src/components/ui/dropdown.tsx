"use client";

import { createListCollection, Field, Icon, Text } from "@chakra-ui/react";
import * as React from "react";
import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";

export interface DropdownOption {
  label: string;
  value: string;
  description?: React.ReactNode;
}

export interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onValueChange: (value: string) => void;
  label?: string;
  labelIcon?: React.ElementType;
  labelIconTooltip?: React.ReactNode;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  width?: string;
  maxW?: string;
  flex?: string | number;
  invalid?: boolean;
  errorText?: React.ReactNode;
}

export const Dropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  function Dropdown(
    {
      options,
      value,
      onValueChange,
      label,
      labelIcon,
      labelIconTooltip,
      required,
      placeholder,
      disabled,
      width,
      maxW,
      flex,
      invalid,
      errorText,
    },
    ref,
  ) {
    const collection = React.useMemo(
      () => createListCollection({ items: options }),
      [options],
    );

    const renderOption = (option: DropdownOption) => (
      <Text as="span">
        <Text as="span" fontWeight="bold">
          {option.label}
          {option.description && ":"}
        </Text>
        {option.description && <> {option.description}</>}
      </Text>
    );

    return (
      <Field.Root
        orientation="vertical"
        width={width}
        maxW={maxW}
        flex={flex}
        required={required}
        invalid={invalid}
      >
        <SelectRoot
          ref={ref}
          variant="outline"
          collection={collection}
          value={value ? [value] : []}
          disabled={disabled}
          onValueChange={({ value: newValue }) =>
            onValueChange(newValue[0] ?? "")
          }
        >
          {label && (
            <SelectLabel display="flex" alignItems="center" gap="8px">
              <Text
                fontFamily="heading"
                color="content.secondary"
                fontSize="label.lg"
                fontWeight="medium"
                lineHeight="20"
                letterSpacing="wide"
              >
                {label}
              </Text>
              <Field.RequiredIndicator />
              {labelIcon &&
                (labelIconTooltip ? (
                  <Tooltip content={labelIconTooltip} showArrow openDelay={100}>
                    <Icon
                      as={labelIcon}
                      color="interactive.control"
                      boxSize={4}
                    />
                  </Tooltip>
                ) : (
                  <Icon
                    as={labelIcon}
                    color="interactive.control"
                    boxSize={4}
                  />
                ))}
            </SelectLabel>
          )}
          <SelectTrigger
            css={{
              "& [data-part=trigger]": {
                borderWidth: "1px",
                borderColor: invalid
                  ? "sentiment.negativeDefault"
                  : "border.neutral",
                borderRadius: "minimal",
                bg: "background.default",
              },
            }}
          >
            <SelectValueText
              overflow="hidden"
              textOverflow="ellipsis"
              color="content.tertiary"
              fontFamily="body"
              fontSize="body.lg"
              fontWeight="regular"
              lineHeight="24"
              letterSpacing="wide"
              placeholder={placeholder}
            >
              {(items) => renderOption(items[0] as DropdownOption)}
            </SelectValueText>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                item={option}
                key={option.value}
                _highlighted={{ bg: "background.neutral" }}
              >
                {renderOption(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
        {errorText && <Field.ErrorText>{errorText}</Field.ErrorText>}
      </Field.Root>
    );
  },
);
