import { RadioButton } from "@/components/radio-button";
import { ArrowBackIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  HStack,
  Heading,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import { RefObject, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  valueType: string | null;
  methodology: string | null;
  activityDataAmount: number;
  activityDataUnit: string;
};

const defaultValues: Inputs = {
  valueType: null,
  methodology: null,
  activityDataAmount: 0,
  activityDataUnit: "kWh",
};

function FuelCombustionTab() {
  return <TabPanel>One</TabPanel>;
}

function GridEnergyTab() {
  return <TabPanel>Two</TabPanel>;
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
  t: Function;
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

  // reset form values when choosing another subsector
  // useEffect(() => reset({ defaultValues }), [subsector, reset]);

  const {
    getRootProps: getValueTypeRootProps,
    getRadioProps: getValueTypeRadioProps,
    value: valueTypeValue,
  } = useRadioGroup({
    name: "valueType",
    onChange: console.log, // TODO change section after radio using this
  });
  const valueTypeGroup = getValueTypeRootProps();

  const {
    getRootProps: getMethodologyRootProps,
    getRadioProps: getMethodologyRadioProps,
    value: methodologyValue,
  } = useRadioGroup({
    name: "methodology",
    onChange: console.log,
  });
  const methodologyGroup = getMethodologyRootProps();

  const isSubmitEnabled = !!valueTypeValue && !!methodologyValue;

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      size="xl"
      finalFocusRef={finalFocusRef}
    >
      <DrawerOverlay />
      <DrawerContent px={0} py={0}>
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
            <DrawerBody className="space-y-6">
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
                  className={`${
                    valueTypeValue ? undefined : "invisible"
                  } space-y-6`}
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
                  <Tabs className={methodologyValue ? undefined : "invisible"}>
                    <TabList>
                      <Tab>{t("fuel-combustion")}</Tab>
                      <Tab>{t("grid-supplied-energy")}</Tab>
                    </TabList>
                    <TabPanels>
                      <FuelCombustionTab />
                      <GridEnergyTab />
                    </TabPanels>
                  </Tabs>
                </Box>
              </form>
            </DrawerBody>
          )}
        </Box>
        <Stack w="full" px={16} py={6} className="drop-shadow-top border-t-2">
          <Button
            onClick={handleSubmit(onSubmit)}
            isDisabled={!isSubmitEnabled}
            isLoading={isSaving}
            w="full"
            h={16}
          >
            {t("add-data")}
          </Button>
        </Stack>
      </DrawerContent>
    </Drawer>
  );
}
