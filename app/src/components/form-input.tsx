"use client";

import { Input, Text } from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";
import { FieldError } from "react-hook-form";
import { Field } from "@/components/ui/field";

interface FormInputProps {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: Function;
  id: string;
  required?: boolean;
}

const FormInput: FC<FormInputProps> = ({
  label,
  value,
  isDisabled,
  error,
  register,
  id,
  required = true,
}) => {
  const [inputValue, setInputValue] = useState<string | undefined | null>(
    value,
  );

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  const onInputChange2 = (e: any) => {
    setInputValue(e.target.value);
  };

  return (
    <Field
      display="flex"
      flexDirection="column"
      invalid={!!error}
      label={
        <Text
          fontSize="label.lg"
          fontStyle="normal"
          fontWeight="medium"
          letterSpacing="wide"
        >
          {label}
        </Text>
      }
    >
      <Input
        shadow="1dp"
        name={id}
        borderRadius="4px"
        border="inputBox"
        background={isDisabled ? "background.neutral" : "background.default"}
        color={isDisabled ? "content.tertiary" : "content.secondary"}
        readOnly={isDisabled}
        {...register(id, required ? {
          required: `This is a required field!`,
        } : {})}
        onChange={onInputChange2}
        placeholder={label}
      />
      {error && (
        <Text
          color="sentiment.negativeDefault"
          fontFamily="heading"
          fontSize="body.md"
          fontWeight="normal"
          letterSpacing="wide"
        >
          {error.message}
        </Text>
      )}
    </Field>
  );
};

export default FormInput;
