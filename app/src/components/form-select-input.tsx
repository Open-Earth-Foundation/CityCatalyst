import { Box, Text } from "@chakra-ui/react";
import { FieldError, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { NativeSelectField, NativeSelectRoot } from "./ui/native-select";
import { TFunction } from "i18next";

interface FormInputProps<TFieldValues extends FieldValues> {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: UseFormRegister<TFieldValues>;
  id: Path<TFieldValues>;
  onInputChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  t: TFunction;
}

const FormSelectInput = <TFieldValues extends FieldValues>({
  label,
  isDisabled,
  value,
  register,
  id,
  onInputChange,
  t,
}: FormInputProps<TFieldValues>) => {
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
        disabled={isDisabled}
      >
        <NativeSelectField
          value={value || ""}
          {...register(id, {
            required: `${id} is required`,
          })}
          onChange={(e) => onInputChange(e)}
        >
          <option value="admin">{t("admin")}</option>
          <option value="contributor">{t("contributor")}</option>
        </NativeSelectField>
      </NativeSelectRoot>
    </Box>
  );
};

export default FormSelectInput;
