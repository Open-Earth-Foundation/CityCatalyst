import { ExtraField } from "@/util/form-schema";
import { Box, Icon, NativeSelectField, Text } from "@chakra-ui/react";
import {
  Control,
  Controller,
  FieldErrors,
  FieldValues,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetError,
  useWatch,
} from "react-hook-form";
import React from "react";
import { TFunction } from "i18next";
import { MdWarning } from "react-icons/md";
import { NativeSelectRoot } from "./ui/native-select";

const DependentSelectInput = ({
  field,
  setValue,
  control,
  t,
  errors,
}: {
  field: ExtraField;
  register: UseFormRegister<FieldValues>;
  setValue: (name: string, value: unknown) => void;
  getValues: UseFormGetValues<FieldValues>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  setError: UseFormSetError<FieldValues>;
  t: TFunction;
}) => {
  const dependentFieldKey = field.dependsOn;
  const dependentOptions = field.dependentOptions;
  const dependentValue = useWatch({
    control,
    name: `activity.${dependentFieldKey}`,
  });
  const fieldId = field.id;
  const activityErrors = errors?.activity as
    | Record<string, { message?: string } | undefined>
    | undefined;
  const fieldError = activityErrors?.[fieldId];
  return (
    <Controller
      control={control}
      rules={{ required: t("option-required") }}
      render={({ field }) => {
        return (
          <Box display="flex" flexDirection="column" gap="8px">
            <NativeSelectRoot
              borderRadius="4px"
              borderWidth={fieldError ? "1px" : 0}
              border="inputBox"
              h="full"
              p={0}
              w="full"
              disabled={!dependentValue}
              shadow="1dp"
              borderColor={
                fieldError ? "sentiment.negativeDefault" : ""
              }
              background={
                fieldError ? "sentiment.negativeOverlay" : ""
              }
              _focus={{
                borderWidth: "1px",
                shadow: "none",
                borderColor: "content.link",
              }}
              onChange={(e: React.ChangeEvent<HTMLDivElement>) => {
                // The change event bubbles up from the inner <select>.
                const value = (e.target as unknown as HTMLSelectElement)
                  .value;
                field.onChange(value);
                setValue(`activity.${fieldId}`, value);
              }}
              bgColor="base.light"
            >
              <NativeSelectField
                placeholder={
                  !dependentValue
                    ? t("dependent-extra-field-placeholder", {
                        dependency: t(dependentFieldKey ?? ""),
                      })
                    : t("option-required")
                }
              >
                {dependentOptions?.[dependentValue]?.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
            {fieldError ? (
              <Box display="flex" gap="6px" alignItems="center">
                <Icon as={MdWarning} color="sentiment.negativeDefault" />
                <Text fontSize="body.md">
                  {fieldError?.message}
                </Text>
              </Box>
            ) : (
              ""
            )}
          </Box>
        );
      }}
      name={`activity.${fieldId}`}
    />
  );
};

export default DependentSelectInput;
