import { ExtraField } from "@/util/form-schema";
import { Box, Select, Text } from "@chakra-ui/react";
import { useWatch } from "react-hook-form";
import { WarningIcon } from "@chakra-ui/icons";
import React from "react";

const DependentSelectInput = ({
  field,
  register,
  setValue,
  getValues,
  control,
  t,
  errors,
}: {
  field: ExtraField;
  register: Function;
  setValue: Function;
  getValues: Function;
  control: any;
  errors: Record<string, any>;
  setError: Function;
  t: any;
}) => {
  const dependentFieldKey = field.dependsOn;
  const dependentValue = useWatch({
    control,
    name: `activity.${dependentFieldKey}`,
  });
  const fieldId = field.id;
  return (
    <Box display="flex" flexDirection="column" gap="8px">
      <Select
        borderRadius="4px"
        borderWidth={errors?.activity?.[fieldId] ? "1px" : 0}
        border="inputBox"
        h="48px"
        disabled={!dependentValue}
        shadow="1dp"
        borderColor={
          errors?.activity?.[fieldId] ? "sentiment.negativeDefault" : ""
        }
        background={
          errors?.activity?.[fieldId] ? "sentiment.negativeOverlay" : ""
        }
        _focus={{
          borderWidth: "1px",
          shadow: "none",
          borderColor: "content.link",
        }}
        {...register(`activity.${fieldId}`, {
          required: t("value-required"),
        })}
        bgColor="base.light"
        placeholder={
          !dependentValue
            ? t("dependent-extra-field-placeholder", {
                dependency: t(dependentFieldKey),
              })
            : t("option-required")
        }
      >
        {field.dependentOptions?.[dependentValue]?.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </Select>
      {errors?.activity?.[fieldId] ? (
        <Box display="flex" gap="6px" alignItems="center">
          <WarningIcon color="sentiment.negativeDefault" />
          <Text fontSize="body.md">{errors?.activity?.[fieldId]?.message}</Text>
        </Box>
      ) : (
        ""
      )}
    </Box>
  );
};

export default DependentSelectInput;
