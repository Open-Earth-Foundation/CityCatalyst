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
import { Control, Controller, useController } from "react-hook-form";
import { resolve } from "@/util/helpers";

const fields = [
  "activityDataAmount",
  "activityDataUnit",
  "emissionFactorType",
  "co2EmissionFactor",
  "n2oEmissionFactor",
  "ch4EmissionFactor",
  "sourceReference",
];

function ControlledTabs({
  control,
  name,
  children,
}: {
  control: Control;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => {
        const setEnergyTypeTabIndex = (index: number) => {
          const value =
            index === 0 ? "fuel-combustion" : "grid-supplied-energy";
          onChange(value);
        };
        return (
          <Tabs
            onChange={setEnergyTypeTabIndex}
            index={value === "fuel-combustion" ? 0 : 1}
          >
            {children}
          </Tabs>
        );
      }}
    />
  );
}

export function EmissionsForm({
  t,
  register,
  setValue,
  errors,
  control,
  prefix = "",
  watch,
  sectorNumber,
}: {
  t: TFunction;
  register: Function;
  setValue: Function;
  errors: Record<string, any>;
  control: Control<any, any>;
  prefix?: string;
  watch: Function;
  sectorNumber: string;
}) {
  const hasFuelError = fields.some(
    (field) => !!resolve(prefix + "fuel." + field, errors),
  );
  const hasGridError = fields.some(
    (field) => !!resolve(prefix + "grid." + field, errors),
  );

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
        <ControlledTabs control={control} name={prefix + "energyType"}>
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
              watch={watch}
              sectorNumber={sectorNumber}
            />
            <ActivityDataTab
              t={t}
              register={register}
              errors={errors}
              prefix={prefix + "grid."}
              watch={watch}
              sectorNumber={sectorNumber}
            />
          </TabPanels>
        </ControlledTabs>
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
