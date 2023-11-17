import { RadioButton } from "@/components/radio-button";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  Heading,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import { ActivityDataTab } from "./ActivityDataTab";
import { DirectMeasureForm } from "./DirectMeasureForm";
import { TFunction } from "i18next";
import { Control, useController } from "react-hook-form";

export function EmissionsForm({
  t,
  register,
  errors,
  control,
  prefix = "",
  watch,
  sectorNumber,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  control: Control<any, any>;
  prefix?: string;
  watch: Function;
  sectorNumber: string;
}) {
  const { field } = useController({
    name: prefix + "methodology",
    control,
    defaultValue: "",
  });
  const {
    getRootProps,
    getRadioProps,
    value: methodology,
  } = useRadioGroup(field);

  return (
    <Box className="space-y-6">
      <Heading size="sm" className="font-normal">
        {t("select-methodology")}{" "}
        <Tooltip
          hasArrow
          label={t("methodology-tooltip")}
          bg="content.secondary"
          color="base.light"
          placement="bottom-start"
        >
          <InfoOutlineIcon mt={-0.5} color="content.tertiary" />
        </Tooltip>
      </Heading>
      <HStack spacing={4} {...getRootProps()}>
        <RadioButton {...getRadioProps({ value: "activity-data" })}>
          {t("activity-data")}
        </RadioButton>
        <RadioButton {...getRadioProps({ value: "direct-measure" })}>
          {t("direct-measure")}
        </RadioButton>
      </HStack>
      {/*** Activity data ***/}
      {methodology === "activity-data" && (
        <ActivityDataTab
          t={t}
          register={register}
          errors={errors}
          prefix={prefix + "activity."}
          watch={watch}
          sectorNumber={sectorNumber}
        />
      )}
      {/*** Direct measure ***/}
      {methodology === "direct-measure" && (
        <DirectMeasureForm
          t={t}
          register={register}
          errors={errors}
          prefix={prefix + "direct."}
        />
      )}
    </Box>
  );
}
