"use client";

import { Box, FormControl, FormLabel, Input, Text } from "@chakra-ui/react";
import React, { FC, LegacyRef, useEffect, useRef, useState } from "react";
import { FieldError } from "react-hook-form";

interface FormInputProps {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: Function;
  id: string;
}

const FormInput: FC<FormInputProps> = ({
  label,
  value,
  isDisabled,
  error,
  register,
  id,
}) => {
  const [inputValue, setInputValue] = useState<string | undefined | null>(
    value,
  );

  //   if (value) console.log(value);

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  if (inputValue?.length) console.log(inputValue);

  const onInputChange2 = (e: any) => {
    setInputValue(e.target.value);
    console.log(e.target.value);
  };

  return (
    <FormControl
      display="flex"
      flexDirection="column"
      gap="8px"
      isInvalid={!!error}
    >
      <FormLabel
        variant="label"
        fontSize="label.lg"
        fontStyle="normal"
        fontWeight="medium"
        letterSpacing="wide"
      >
        {label}
      </FormLabel>
      <Input
        shadow="1dp"
        name={id}
        borderRadius="4px"
        border="inputBox"
        background={isDisabled ? "background.neutral" : "background.default"}
        color={isDisabled ? "content.tertiary" : "content.secondary"}
        readOnly={isDisabled}
        {...register(id)}
        onChange={onInputChange2}
      />
    </FormControl>
  );
};

export default FormInput;
