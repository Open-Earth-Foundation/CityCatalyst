import { ExtraField } from "@/util/form-schema";
import { Box } from "@chakra-ui/react";
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
import {
  ModalFieldError,
  ModalSelect,
} from "./Modals/activity-modal/sections/ModalField";

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
    Record<string, { message?: string } | undefined> | undefined;
  const fieldError = activityErrors?.[fieldId];
  return (
    <Controller
      control={control}
      rules={{ required: t("option-required") }}
      render={({ field }) => {
        return (
          <Box display="flex" flexDirection="column" gap="8px">
            <ModalSelect
              disabled={!dependentValue}
              invalid={!!fieldError}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              placeholder={
                !dependentValue
                  ? t("dependent-extra-field-placeholder", {
                      dependency: t(dependentFieldKey ?? ""),
                    })
                  : t("option-required")
              }
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                field.onChange(e.target.value);
                setValue(`activity.${fieldId}`, e.target.value);
              }}
            >
              {dependentOptions?.[dependentValue]?.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </ModalSelect>
            {fieldError && <ModalFieldError message={fieldError.message} />}
          </Box>
        );
      }}
      name={`activity.${fieldId}`}
    />
  );
};

export default DependentSelectInput;
