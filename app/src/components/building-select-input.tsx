import { Box, Select, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { UseFormRegister } from "react-hook-form";
import { Inputs } from "./Modals/add-activity-modal";
import { t } from "i18next";

interface BuildingTypeSelectInputProps {
  title: string;
  options: string[];
  placeholder: string;
  register: UseFormRegister<Inputs>;
  activity: string;
}

const BuildingTypeSelectInput: FC<BuildingTypeSelectInputProps> = ({
  title,
  options,
  placeholder,
  register,
  activity,
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
        border="inputBox"
        background="background.default"
        color="content.secondary"
        placeholder={placeholder}
        {...register(activity as any, { required: t("value-required") })}
      >
        {options.map((item: string) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </Select>
    </Box>
  );
};

export default BuildingTypeSelectInput;
