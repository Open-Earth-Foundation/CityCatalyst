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

export function EmissionsForm({
  t,
  register,
  errors,
  control,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  control: Control<any, any>;
}) {
  const hasFuelError =
    errors.fuelActivityDataAmount ||
    errors.fuelActivityDataUnit ||
    errors.fuelEmissionFactorType ||
    errors.fuelCo2EmissionFactor ||
    errors.fuelN2oEmissionFactor ||
    errors.fuelCh4EmissionFactor ||
    errors.fuelSourceReference;
  const hasGridError =
    errors.gridActivityDataAmount ||
    errors.gridActivityDataUnit ||
    errors.gridEmissionFactorType ||
    errors.gridCo2EmissionFactor ||
    errors.gridN2oEmissionFactor ||
    errors.gridCh4EmissionFactor ||
    errors.gridSourceReference;

  const { field } = useController({
    name: "methodology",
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
          bg="contentSecondary"
          color="baseLight"
          placement="bottom-start"
        >
          <InfoOutlineIcon mt={-0.5} color="contentTertiary" />
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
      <Tabs className={methodology == "activity-data" ? undefined : "hidden"}>
        <TabList>
          <Tab>
            {t("fuel-combustion")}{" "}
            {hasFuelError && (
              <Icon
                as={MdError}
                boxSize={4}
                ml={2}
                color="sentimentNegativeDefault"
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
                color="sentimentNegativeDefault"
              />
            )}
          </Tab>
        </TabList>
        <TabPanels>
          <ActivityDataTab
            t={t}
            register={register}
            errors={errors}
            prefix="fuel"
          />
          <ActivityDataTab
            t={t}
            register={register}
            errors={errors}
            prefix="grid"
          />
        </TabPanels>
      </Tabs>
      {/*** Direct measure ***/}
      <DirectMeasureForm
        className={methodology == "direct-measure" ? undefined : "hidden"}
        t={t}
        register={register}
        errors={errors}
      />
    </Box>
  );
}
