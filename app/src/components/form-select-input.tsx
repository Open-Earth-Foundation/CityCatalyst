import { Box, Select, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { FieldError } from "react-hook-form";
import { NativeSelectField, NativeSelectRoot } from "./ui/native-select";

interface FormInputProps {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: Function;
  id: string;
  onInputChange: Function;
}

const FormSelectInput: FC<FormInputProps> = ({
  label,
  isDisabled,
  value,
  error,
  register,
  id,
  onInputChange,
}) => {
  return (
    <Box display="flex" flexDirection="column" gap="8px">
      <Text
        fontSize="label.lg"
        fontStyle="normal"
        fontWeight="medium"
        letterSpacing="wide"
        fontFamily="heading"
      >
        {label}
      </Text>
      <NativeSelectRoot
        shadow="1dp"
        borderRadius="4px"
        border="inputBox"
        background={isDisabled ? "background.neutral" : "background.default"}
        color={isDisabled ? "content.tertiary" : "content.secondary"}
      >
        <NativeSelectField
          value={value || ""}
          {...register(id, {
            required: `${id} is required`,
          })}
          onChange={(e) => onInputChange(e)}
          disabled={isDisabled}
        >
          <option value="admin">Admin</option>
          <option value="contributor">Contributor</option>
        </NativeSelectField>
      </NativeSelectRoot>
    </Box>
  );
};

export default FormSelectInput;
