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
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  width?: string;
  maxW?: string;
  flex?: string | number;
}

export const Dropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  function Dropdown(
    {
      options,
      value,
      onValueChange,
      label,
      labelIcon,
      required,
      placeholder,
      disabled,
      width,
      maxW,
      flex,
    },
    ref,
  ) {
    const collection = React.useMemo(
      () => createListCollection({ items: options }),
      [options],
    );

    return (
      <Field.Root
        orientation="vertical"
        width={width}
        maxW={maxW}
        flex={flex}
        required={required}
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
              {labelIcon && (
                <Icon as={labelIcon} color="interactive.control" boxSize={4} />
              )}
            </SelectLabel>
          )}
          <SelectTrigger
            css={{
              "& [data-part=trigger]": {
                borderWidth: "1px",
                borderColor: "border.neutral",
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
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem item={option} key={option.value}>
                <Text as="span" fontWeight="bold">
                  {option.label}
                </Text>
                {option.description && <>: {option.description}</>}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </Field.Root>
    );
  },
);
