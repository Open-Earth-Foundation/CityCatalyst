import React from "react";
import { Control, Controller } from "react-hook-form";
import {
  InputGroup,
  InputRightAddon,
  NumberInput,
  NumberInputField,
} from "@chakra-ui/react";

function FormattedNumberInput({
  control,
  name,
  defaultValue = 0,
  isDisabled = false,
  children, // Accepts children for InputRightAddon
  ...rest
}: {
  control: Control<any, any>;
  name: string;
  defaultValue?: number;
  isDisabled?: boolean;
  children?: React.ReactNode;
}) {
  const format = (nval: number | string) => {
    let val = parseInt(nval as string);
    if (val === undefined || val === null || isNaN(val)) return "";
    return val.toLocaleString();
  };

  const parse = (val: string) => val.replace(/,/g, "");

  return (
    <Controller
      control={control}
      name={name}
      defaultValue={defaultValue}
      render={({ field }) => (
        <InputGroup>
          <NumberInput
            min={0}
            isDisabled={isDisabled}
            value={format(field.value)}
            onChange={(valueAsString) => {
              const parsedValue = parse(valueAsString);
              const numberValue = parseFloat(parsedValue);
              field.onChange(isNaN(numberValue) ? "" : numberValue);
            }}
            {...rest}
          >
            <NumberInputField
              h="48px"
              type="text" // Use text type to allow formatted input
              shadow="1dp"
              borderRightRadius={children ? 0 : "md"} // Adjust border radius
              bgColor={isDisabled ? "background.neutral" : "base.light"}
              pos="relative"
              zIndex={999}
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
              w="auto"
              maxW="100px"
              overflowX="hidden"
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
