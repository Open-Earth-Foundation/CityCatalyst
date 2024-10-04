import { Box, Select, Text } from "@chakra-ui/react";
import React, { FC, use, useEffect, useRef, useState } from "react";
import {
  Control,
  Controller,
  FieldError,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { Inputs } from "./Modals/activity-modal/activity-modal-body";
import { WarningIcon } from "@chakra-ui/icons";
import { TFunction } from "i18next";
import type { SuggestedActivity } from "@/util/form-schema";
import MultiSelectInput from "@/components/MultiSelectInput";

interface BuildingTypeSelectInputProps {
  title: string;
  options: string[];
  placeholder: string;
  register: UseFormRegister<Inputs>;
  activity: string;
  errors: Record<string, any>;
  t: TFunction;
  selectedActivity?: SuggestedActivity;
  control: Control<Inputs, any>;
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
      setValue(activity as any, prefilledValue);
    }
  }, [prefilledValue]);

  if (multiselect) {
    return (
      <MultiSelectInput
        title={title}
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

  const error = activity.split(".").reduce((acc, key) => acc?.[key], errors);
  return (
    <Box display="flex" flexDirection="column" gap="8px">
      <Text
        variant="label"
        fontSize="label.lg"
        fontStyle="normal"
        fontWeight="medium"
        letterSpacing="wide"
        fontFamily="heading"
      >
        {t(title)}
      </Text>
      <Controller
        name={activity as any}
        control={control}
        defaultValue={selectedActivityValue}
        rules={{ required: required === false ? false : t("option-required") }}
        render={({ field }) => {
          return (
            <Select
              {...field}
              shadow="1dp"
              borderRadius="4px"
              borderWidth={error ? "1px" : 0}
              border="inputBox"
              borderColor={error ? "sentiment.negativeDefault" : ""}
              background={error ? "sentiment.negativeOverlay" : ""}
              fontSize="body.lg"
              h="48px"
              placeholder={placeholder}
              _focus={{
                borderWidth: "1px",
                borderColor: "content.link",
                shadow: "none",
              }}
              onChange={(e) => {
                field.onChange(e.target.value);
                setValue(activity as any, e.target.value);
              }}
              value={field.value}
            >
              {options?.map((item: string) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </Select>
          );
        }}
      />
      {error ? (
        <Box display="flex" gap="6px" alignItems="center">
          <WarningIcon color="sentiment.negativeDefault" />
          <Text fontSize="body.md">{error?.message}</Text>
        </Box>
      ) : (
        ""
      )}
    </Box>
  );
};

export default BuildingTypeSelectInput;
