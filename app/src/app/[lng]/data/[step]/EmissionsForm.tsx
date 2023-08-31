import { RadioButton } from "@/components/radio-button";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  Heading,
  Icon,
  Tab,
  TabList,
  TabPanels,
  Tabs,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import { MdError } from "react-icons/md";
import { ActivityDataTab } from "./ActivityDataTab";
import { DirectMeasureForm } from "./DirectMeasureForm";
import { TFunction } from "i18next";
import { Control, useController } from "react-hook-form";

const fields = [
  "activityDataAmount",
  "activityDataUnit",
  "emissionFactorType",
  "co2EmissionFactor",
  "n2oEmissionFactor",
  "ch4EmissionFactor",
  "sourceReference",
];

export function EmissionsForm({
  t,
  register,
  errors,
  control,
  prefix = "",
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  control: Control<any, any>;
  prefix?: string;
}) {
  const hasFuelError = fields.some((field) => !!errors[prefix + "fuel." + field]);
  const hasGridError = fields.some((field) => !!errors[prefix + "grid." + field]);

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
        <Tabs>
          <TabList>
            <Tab>
              {t("fuel-combustion")}{" "}
              {hasFuelError && (
                <Icon
                  as={MdError}
                  boxSize={4}
                  ml={2}
                  color="sentiment.negativeDefault"
                />
              )}
            </Tab>
            <Tab>
              {t("grid-supplied-energy")}{" "}
              {hasGridError && (
                <Icon
                  as={MdError}
                  boxSize={4}
                  ml={2}
                  color="sentiment.negativeDefault"
                />
              )}
            </Tab>
          </TabList>
          <TabPanels>
            <ActivityDataTab
              t={t}
              register={register}
              errors={errors}
              prefix={prefix + "fuel."}
            />
            <ActivityDataTab
              t={t}
              register={register}
              errors={errors}
              prefix={prefix + "grid."}
            />
          </TabPanels>
        </Tabs>
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
