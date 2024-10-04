import React, { useEffect, useState } from "react";
import Select, { components, MultiValueProps, OptionProps } from "react-select";
import { Checkbox, Box, Text, CloseButton } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { WarningIcon } from "@chakra-ui/icons";
import { Control, Controller } from "react-hook-form";
import { Inputs } from "@/components/Modals/activity-modal/activity-modal-body";

interface MultiSelectInputProps {
  title: string;
  options: string[];
  placeholder: string;
  activity: string;
  errors: Record<string, any>;
  t: TFunction;
  multiselect?: boolean;
  required?: boolean;
  control: Control<any, any>;
  selectedActivity?: string;
}

const CustomMultiValue = (props: MultiValueProps<any>) => {
  const { data, removeProps } = props;

  return (
    <Box
      display="flex"
      alignItems="center"
      bg="background.neutral"
      borderRadius="8px"
      px="8px"
      py="4px"
      m="2px"
      borderLeftRadius="32px"
      borderRightRadius="32px"
    >
      <Text fontSize="sm" fontWeight="bold" color="content.alternative" mr={2}>
        {data.label}
      </Text>
      <div className="" onClick={removeProps.onClick}>
        <CloseButton size="sm" color="content.alternative" />
      </div>
    </Box>
  );
};

const CustomOption = (props: OptionProps<any>) => {
  const { data, isSelected, innerRef, innerProps } = props;

  return (
    <Box
      ref={innerRef}
      {...innerProps}
      display="flex"
      alignItems="center"
      gap="16px"
      py="12px"
      px="16px"
    >
      <Checkbox
        className="pointer-events-none !mb-[0px]"
        isChecked={isSelected}
      />
      <Text fontSize="14px" color="content.secondary">
        {data.label}
      </Text>
    </Box>
  );
};

const customStyles = (error: boolean) => ({
  control: (provided: any, state: any) => ({
    ...provided,
    borderRadius: "4px",
    borderColor:
      state.isHovered || state.isFocused
        ? "#2351DC"
        : error
          ? "#F23D33"
          : "#D7D8FB",
    background: error ? "#FFEAEE" : "#fff",
    boxShadow: "0px 1px 2px -1px #0000001A, 0px 1px 3px 0px #00001F1A",
    minHeight: "48px",
    fontSize: "16px",
    "&:focus": {
      borderColor: "#2351DC",
    },
  }),
  placeholder: (provided: any) => ({
    ...provided,
    fontSize: "16px",
    color: "#A0AEC0",
  }),
});

const MultiSelectWithCheckbox = ({
  title,
  options,
  placeholder,
  required,
  activity,
  errors,
  t,
  control,
  selectedActivity,
}: MultiSelectInputProps) => {
  const error = activity.split(".").reduce((acc, key) => acc?.[key], errors);
  let preselectedValue = selectedActivity
    ? {
        label: t(selectedActivity),
        value: selectedActivity,
      }
    : null;

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
        name={activity}
        control={control}
        rules={{
          required: required === false ? false : t("option-required"),
        }}
        render={({ field }) => {
          const currentValue = Array.isArray(field.value) ? field.value : []; // Ensure field.value is an array

          return (
            <Select
              {...field}
              isMulti
              options={options.map((option) => ({
                label: t(option),
                value: option,
              }))}
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{
                MultiValue: CustomMultiValue,
                Option: CustomOption,
              }}
              value={
                currentValue.length > 0
                  ? currentValue.map((val: string) => ({
                      label: t(val),
                      value: val,
                    }))
                  : preselectedValue
                    ? [preselectedValue]
                    : []
              }
              onChange={(selected) => {
                preselectedValue = null;
                const values = selected?.map((option) => option.value) || [];
                field.onChange(values);
              }}
              placeholder={t(placeholder)}
              styles={customStyles(!!error)}
            />
          );
        }}
      />
      {error ? (
        <Box display="flex" gap="6px" alignItems="center">
          <WarningIcon color="sentiment.negativeDefault" />
          <Text fontSize="body.md">{error?.message}</Text>
        </Box>
      ) : null}
    </Box>
  );
};

export default MultiSelectWithCheckbox;
