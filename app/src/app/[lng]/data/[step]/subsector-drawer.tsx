import { RadioButton } from "@/components/radio-button";
import { ArrowBackIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
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
  chakra,
  useRadioGroup,
} from "@chakra-ui/react";
import { RefObject, useState } from "react";

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
  const onSubmit = async () => {
    setSaving(true);
    onSave(subsector!);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setSaving(false);
    onClose();
  };

  const {
    getRootProps: getValueTypeRootProps,
    getRadioProps: getValueTypeRadioProps,
  } = useRadioGroup({
    name: "value-type",
    onChange: console.log, // TODO change section after radio using this
  });
  const valueTypeGroup = getValueTypeRootProps();

  const {
    getRootProps: getMethodologyRootProps,
    getRadioProps: getMethodologyRadioProps,
  } = useRadioGroup({
    name: "methodology",
    onChange: console.log,
  });
  const methodologyGroup = getMethodologyRootProps();

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
        <chakra.div h="full" px={16} py={12}>
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
              <Text color="contentTertiary">{t(subsector.title + "-description")}</Text>
              <Heading size="md">{t("enter-subsector-data")}</Heading>
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
              <HStack spacing={4} {...valueTypeGroup}>
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
              <HStack spacing={4} {...methodologyGroup}>
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
              <Tabs>
                <TabList>
                  <Tab>{t("fuel-combustion")}</Tab>
                  <Tab>{t("grid-supplied-energy")}</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>One</TabPanel>
                  <TabPanel>Two</TabPanel>
                </TabPanels>
              </Tabs>
            </DrawerBody>
          )}
        </chakra.div>
        <Stack w="full" px={16} py={6} className="drop-shadow-top border-t-2">
          <Button onClick={onSubmit} isLoading={isSaving} w="full" h={16}>
            {t("add-data")}
          </Button>
        </Stack>
      </DrawerContent>
    </Drawer>
  );
}
