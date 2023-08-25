import { RadioButton } from "@/components/radio-button";
import { ArrowBackIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  Icon,
  InputGroup,
  InputRightAddon,
  NumberInput,
  NumberInputField,
  Select,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { RefObject, useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdError } from "react-icons/md";
import { ActivityDataTab } from "./ActivityDataTab";

type Inputs = {
  valueType: string;
  methodology: string;
  fuelActivityDataAmount?: number;
  fuelActivityDataUnit: string;
  fuelEmissionFactorType: string;
  fuelCo2EmissionFactor: number;
  fuelN2oEmissionFactor: number;
  fuelCh4EmissionFactor: number;
  fuelSourceReference: string;
  gridActivityDataAmount?: number;
  gridActivityDataUnit: string;
  gridEmissionFactorType: string;
  gridCo2EmissionFactor: number;
  gridN2oEmissionFactor: number;
  gridCh4EmissionFactor: number;
  gridSourceReference: string;
};

const defaultValues: Inputs = {
  valueType: "",
  methodology: "",
  fuelActivityDataAmount: undefined,
  fuelActivityDataUnit: "kWh",
  fuelEmissionFactorType: "Local",
  fuelCo2EmissionFactor: 10,
  fuelN2oEmissionFactor: 10,
  fuelCh4EmissionFactor: 10,
  fuelSourceReference: "",
  gridActivityDataAmount: undefined,
  gridActivityDataUnit: "kWh",
  gridEmissionFactorType: "Local",
  gridCo2EmissionFactor: 10,
  gridN2oEmissionFactor: 10,
  gridCh4EmissionFactor: 10,
  gridSourceReference: "",
};

function DirectMeasureForm({
  t,
  register,
  errors,
  className,
}: {
  t: TFunction;
  register: Function;
  errors: Record<string, any>;
  className?: string;
}) {
  return (
    <Box className={className}>
      <Heading size="sm" mb={4} className="font-normal">
        {t("emission-factors-values")}{" "}
        <Tooltip
          hasArrow
          label={t("value-types-tooltip")}
          placement="bottom-start"
        >
          <InfoOutlineIcon mt={-0.5} color="contentTertiary" />
        </Tooltip>
      </Heading>
      <HStack spacing={4} mb={5}>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("co2-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register("directCo2Emissions")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              tCO2e
            </InputRightAddon>
          </InputGroup>
          <FormHelperText>&nbsp;</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("ch4-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register("directCh4Emissions")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              tCH4e
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="contentTertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel color="contentTertiary">
            {t("n2o-emissions-value")}
          </FormLabel>
          <InputGroup>
            <NumberInput defaultValue={0} min={0}>
              <NumberInputField
                borderRightRadius={0}
                {...register("directN2oEmissions")}
                bgColor="backgroundNeutral"
              />
            </NumberInput>
            <InputRightAddon
              bgColor="backgroundNeutral"
              color="contentTertiary"
            >
              tN2Oe
            </InputRightAddon>
          </InputGroup>
          <FormHelperText color="contentTertiary">
            {t("optional")}
          </FormHelperText>
        </FormControl>
      </HStack>
    </Box>
  );
}

export function SubsectorDrawer({
  subsector,
  isOpen,
  onClose,
  finalFocusRef,
  onSave,
  t,
}: {
  subsector?: SubSector;
  isOpen: boolean;
  onClose: () => void;
  onSave: (subsector: SubSector) => void;
  finalFocusRef?: RefObject<any>;
  t: TFunction;
}) {
  const [isSaving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log("Sector data", data);
    setSaving(true);
    onSave(subsector!);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setSaving(false);
    onClose();
  };

  const {
    getRootProps: getValueTypeRootProps,
    getRadioProps: getValueTypeRadioProps,
    value: valueType,
    setValue: setValueType,
  } = useRadioGroup({
    name: "valueType",
    onChange: console.log, // TODO change section after radio using this
  });
  const valueTypeGroup = getValueTypeRootProps();

  const {
    getRootProps: getMethodologyRootProps,
    getRadioProps: getMethodologyRadioProps,
    value: methodology,
    setValue: setMethodology,
  } = useRadioGroup({
    name: "methodology",
    onChange: console.log,
  });
  const methodologyGroup = getMethodologyRootProps();

  // reset form values when choosing another subsector
  useEffect(() => {
    reset(defaultValues);
    setMethodology("");
    setValueType("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsector]);

  const isSubmitEnabled = !!valueType && !!methodology;
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

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      size="xl"
      finalFocusRef={finalFocusRef}
    >
      <DrawerOverlay />
      <DrawerContent px={0} py={0} className="overflow-auto">
        <Box h="full" px={16} py={12}>
          <Button
            variant="ghost"
            leftIcon={<ArrowBackIcon boxSize={6} />}
            onClick={onClose}
            px={6}
            py={4}
            mb={6}
          >
            {t("go-back")}
          </Button>
          {subsector && (
            <DrawerBody className="space-y-6" p={0}>
              <Heading size="sm">
                {t("sector")} - {t(subsector.sectorName)}
              </Heading>
              <Heading size="lg">{t(subsector.title)}</Heading>
              <Text color="contentTertiary">
                {t(subsector.title + "-description")}
              </Text>
              <Heading size="md">{t("enter-subsector-data")}</Heading>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Heading size="sm">
                  {t("value-types")}{" "}
                  <Tooltip
                    hasArrow
                    label={t("value-types-tooltip")}
                    placement="bottom-start"
                  >
                    <InfoOutlineIcon mt={-1} color="contentTertiary" />
                  </Tooltip>
                </Heading>
                <HStack
                  spacing={4}
                  {...valueTypeGroup}
                  {...register("valueType")}
                >
                  <RadioButton
                    {...getValueTypeRadioProps({ value: "one-value" })}
                  >
                    {t("one-value")}
                  </RadioButton>
                  <RadioButton
                    {...getValueTypeRadioProps({ value: "subcategory-values" })}
                  >
                    {t("subcategory-values")}
                  </RadioButton>
                </HStack>
                <Box
                  className={`${valueType ? undefined : "hidden"} space-y-6`}
                >
                  <Heading size="sm">
                    {t("select-methodology")}{" "}
                    <Tooltip
                      hasArrow
                      label={t("methodology-tooltip")}
                      bg="contentSecondary"
                      color="baseLight"
                      placement="bottom-start"
                    >
                      <InfoOutlineIcon mt={-1} color="contentTertiary" />
                    </Tooltip>
                  </Heading>
                  <HStack
                    spacing={4}
                    {...methodologyGroup}
                    {...register("methodology")}
                  >
                    <RadioButton
                      {...getMethodologyRadioProps({ value: "activity-data" })}
                    >
                      {t("activity-data")}
                    </RadioButton>
                    <RadioButton
                      {...getMethodologyRadioProps({ value: "direct-measure" })}
                    >
                      {t("direct-measure")}
                    </RadioButton>
                  </HStack>
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
                  <DirectMeasureForm className={methodology == "direct-measure" ? undefined : "hidden"} t={t} register={register} errors={errors} />
                </Box>
              </form>
            </DrawerBody>
          )}
          <Stack w="full" py={6} className="drop-shadow-top border-t-2" mt={6}>
            <Button
              onClick={handleSubmit(onSubmit)}
              isDisabled={!isSubmitEnabled}
              isLoading={isSaving}
              type="submit"
              formNoValidate
              w="full"
              h={16}
            >
              {t("add-data")}
            </Button>
          </Stack>
        </Box>
      </DrawerContent>
    </Drawer>
  );
}
