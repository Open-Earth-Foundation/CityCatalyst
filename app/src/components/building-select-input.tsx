import { Box, Select, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { FieldError, FieldErrors, UseFormRegister } from "react-hook-form";
import { Inputs } from "./Modals/add-activity-modal";
import { t } from "i18next";
import { WarningIcon } from "@chakra-ui/icons";
import type { SuggestedActivity } from "@/util/form-schema";

interface BuildingTypeSelectInputProps {
  title: string;
  options: string[];
  placeholder: string;
  register: UseFormRegister<Inputs>;
  activity: string;
  errors: FieldErrors<any>;
  selectedActivity?: SuggestedActivity;
}

const BuildingTypeSelectInput: FC<BuildingTypeSelectInputProps> = ({
  title,
  options,
  placeholder,
  register,
  activity,
  errors,
  selectedActivity,
}) => {
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
        {title}
      </Text>
      <Select
        shadow="1dp"
        borderRadius="4px"
        borderWidth={errors?.[activity] ? "1px" : 0}
        border="inputBox"
        borderColor={errors?.[activity] ? "sentiment.negativeDefault" : ""}
        background={errors?.[activity] ? "sentiment.negativeOverlay" : ""}
        fontSize="body.lg"
        h="48px"
        placeholder={placeholder}
        _focus={{
          borderWidth: "1px",
          borderColor: "content.link",
          shadow: "none",
        }}
        {...register(activity as any, { required: t("value-required") })}
      >
        {options?.map((item: string) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </Select>
      {errors?.[activity] ? (
        <Box display="flex" gap="6px" alignItems="center">
          <WarningIcon color="sentiment.negativeDefault" />
          <Text fontSize="body.md">
            Please select the {title.toLowerCase()}
          </Text>
        </Box>
      ) : (
        ""
      )}
    </Box>
  );
};

export default BuildingTypeSelectInput;
