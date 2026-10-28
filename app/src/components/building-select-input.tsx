import { Box } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import {
  Control,
  Controller,
  FieldValues,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { Inputs } from "./Modals/activity-modal/activity-modal-body";
import { TFunction } from "i18next";
import type { SuggestedActivity } from "@/util/form-schema";
import MultiSelectInput from "@/components/MultiSelectInput";
import {
  ModalFieldError,
  ModalLabel,
  ModalSelect,
} from "./Modals/activity-modal/sections/ModalField";

interface BuildingTypeSelectInputProps {
  title: string;
  options: string[];
  placeholder: string;
  register: UseFormRegister<Inputs>;
  activity: string;
  errors: Record<string, unknown>;
  t: TFunction;
  selectedActivity?: SuggestedActivity;
  control: Control<FieldValues>;
  multiselect?: boolean;
  required?: boolean;
  setValue: UseFormSetValue<Inputs>;
}

const BuildingTypeSelectInput: FC<BuildingTypeSelectInputProps> = ({
  title,
  options,
  placeholder,
  register,
  required,
  activity,
  errors,
  t,
  multiselect,
  control,
  selectedActivity,
  setValue,
}) => {
  const prefilledValue = selectedActivity?.prefills?.[0].value;
  const [selectedActivityValue, setSelectedActivityValue] = useState<
    string | undefined
  >();
  useEffect(() => {
    if (prefilledValue) {
      setSelectedActivityValue(prefilledValue);
      setValue(activity as Path<Inputs>, prefilledValue);
    }
  }, [activity, prefilledValue, setValue]);

  if (multiselect) {
    return (
      <MultiSelectInput
        title={title}
        required={required}
        options={options}
        placeholder={placeholder}
        control={control}
        activity={activity}
        errors={errors}
        t={t}
        selectedActivity={selectedActivityValue}
      />
    );
  }

  const error = activity
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
      errors,
    ) as { message?: string } | undefined;
  const labelText = t(title);
  return (
    <Box display="flex" flexDirection="column" gap="8px" w="full">
      <ModalLabel required={required !== false}>{labelText}</ModalLabel>
      <Controller
        name={activity as Path<Inputs>}
        control={control}
        defaultValue={selectedActivityValue || ""}
        rules={{
          required: required === false ? false : t("option-required"),
        }}
        render={({ field }) => (
          <>
            <ModalSelect
              aria-label={labelText}
              placeholder={placeholder}
              invalid={!!error}
              value={field.value || ""}
              onChange={(e) => {
                const value = e.currentTarget.value;
                field.onChange(value);
                setValue(activity as Path<Inputs>, value);
              }}
            >
              {options?.map((item: string) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </ModalSelect>
            {error ? <ModalFieldError message={error.message} /> : null}
          </>
        )}
      />
    </Box>
  );
};

export default BuildingTypeSelectInput;
