import { Box, NativeSelectField, Select, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { FieldError } from "react-hook-form";
import { NativeSelectRoot } from "./ui/native-select";
import { TFunction } from "i18next";

interface FormInputProps {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: Function;
  id: string;
  onInputChange: Function;
  t: TFunction;
}

const FormSelectOrganization: FC<FormInputProps> = ({
  label,
  isDisabled,
  value,
  error,
  register,
  id,
  onInputChange,
  t,
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
          disabled={isDisabled}
          value={value || ""}
          {...register(id, {
            required: `${id} is required`,
          })}
          onChange={(e) => onInputChange(e)}
        >
          <option value="true">{t("yes")}</option>
          <option value="false">{t("no")}</option>
        </NativeSelectField>
      </NativeSelectRoot>
    </Box>
  );
};

export default FormSelectOrganization;
