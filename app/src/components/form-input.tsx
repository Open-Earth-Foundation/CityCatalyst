"use client";

import { Input, Text } from "@chakra-ui/react";
import { FC } from "react";
import { FieldError, FieldValues, UseFormRegister } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { useTranslation } from "react-i18next";

interface FormInputProps {
  label: string;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: UseFormRegister<FieldValues>;
  id: string;
  required?: boolean;
}

const FormInput: FC<FormInputProps> = ({
  label,
  isDisabled,
  error,
  register,
  id,
  required = true,
}) => {
  const { t } = useTranslation("inputs");
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
        borderRadius="4px"
        border="inputBox"
        background={isDisabled ? "background.neutral" : "background.default"}
        color={isDisabled ? "content.tertiary" : "content.secondary"}
        readOnly={isDisabled}
        {...register(
          id,
          required
            ? {
                required: t("required-field"),
              }
            : {},
        )}
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
