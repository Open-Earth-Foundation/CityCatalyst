import { ExtraField } from "@/util/form-schema";
import { Box, Icon, NativeSelectField, Text } from "@chakra-ui/react";
import { useWatch } from "react-hook-form";
import React from "react";
import { SelectRoot, SelectTrigger, SelectValueText } from "./ui/select";
import { MdWarning } from "react-icons/md";
import { NativeSelectRoot } from "./ui/native-select";

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
      <NativeSelectRoot
        borderRadius="4px"
        borderWidth={errors?.activity?.[fieldId] ? "1px" : 0}
        border="inputBox"
        h="full"
        p={0}
        w="full"
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
      >
        <NativeSelectField
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
        </NativeSelectField>
      </NativeSelectRoot>
      {errors?.activity?.[fieldId] ? (
        <Box display="flex" gap="6px" alignItems="center">
          <Icon as={MdWarning} color="sentiment.negativeDefault" />
          <Text fontSize="body.md">{errors?.activity?.[fieldId]?.message}</Text>
        </Box>
      ) : (
        ""
      )}
    </Box>
  );
};

export default DependentSelectInput;
