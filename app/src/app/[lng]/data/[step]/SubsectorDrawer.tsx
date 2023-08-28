import { RadioButton } from "@/components/radio-button";
import { ArrowBackIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  FormControl,
  HStack,
  Heading,
  Stack,
  Tag,
  Text,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import { Select as ReactSelect } from "chakra-react-select";
import { TFunction } from "i18next";
import { RefObject, useEffect, useState } from "react";
import { SubmitHandler, useController, useForm } from "react-hook-form";
import { EmissionsForm } from "./EmissionsForm";
import { TagSelect } from "@/components/TagSelect";

type SubcategoryOption = {
  label: string;
  value: string;
};

type ActivityData = {
  activityDataAmount?: number;
  activityDataUnit: string;
  emissionFactorType: string;
  co2EmissionFactor: number;
  n2oEmissionFactor: number;
  ch4EmissionFactor: number;
  sourceReference: string;
};

const defaultActivityData: ActivityData = {
  activityDataAmount: undefined,
  activityDataUnit: "kWh",
  emissionFactorType: "Local",
  co2EmissionFactor: 10,
  n2oEmissionFactor: 10,
  ch4EmissionFactor: 10,
  sourceReference: "",
};

type Inputs = {
  valueType: string;
  methodology: string;
  subcategories: SubcategoryOption[];
  fuel: ActivityData;
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
  subcategories: [],
  fuel: defaultActivityData,
  gridActivityDataAmount: undefined,
  gridActivityDataUnit: "kWh",
  gridEmissionFactorType: "Local",
  gridCo2EmissionFactor: 10,
  gridN2oEmissionFactor: 10,
  gridCh4EmissionFactor: 10,
  gridSourceReference: "",
};

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
    watch,
    reset,
    control,
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log("Sector data", data);
    setSaving(true);
    onSave(subsector!); // TODO use new data from API to update
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setSaving(false);
    onClose();
  };

  const { field } = useController({
    name: "valueType",
    control,
    defaultValue: "",
  });
  const { getRootProps, getRadioProps } = useRadioGroup(field);

  // reset form values when choosing another subsector
  useEffect(() => {
    reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsector]);

  const subcategoryData: SubCategory[] = [
    { subcategoryId: "1337", subcategoryName: "Manufacturing" },
    { subcategoryId: "1338", subcategoryName: "Industrial facilities" },
    { subcategoryId: "1339", subcategoryName: "Construction activities" },
  ];
  const subcategoryOptions = subcategoryData.map(
    (subcategory: SubCategory) => ({
      label: subcategory.subcategoryName,
      value: subcategory.subcategoryId,
    })
  );

  const valueType = watch("valueType");
  const methodology = watch("methodology");
  const isSubmitEnabled = !!valueType && !!methodology;
  const subcategories = watch("subcategories");

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
        <Box px={16} py={12} h="full" className="space-y-6">
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
            <>
              <Heading size="sm">
                {t("sector")} - {t(subsector.sectorName)}
              </Heading>
              <Heading size="lg">{t(subsector.title)}</Heading>
              <Text color="content.tertiary">
                {t(subsector.title + "-description")}
              </Text>
              <Heading size="md">{t("enter-subsector-data")}</Heading>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Heading size="sm" className="font-normal">
                  {t("value-types")}{" "}
                  <Tooltip
                    hasArrow
                    label={t("value-types-tooltip")}
                    placement="bottom-start"
                  >
                    <InfoOutlineIcon mt={-1} color="content.tertiary" />
                  </Tooltip>
                </Heading>
                <HStack spacing={4} {...getRootProps()}>
                  <RadioButton {...getRadioProps({ value: "one-value" })}>
                    {t("one-value")}
                  </RadioButton>
                  <RadioButton
                    {...getRadioProps({
                      value: "subcategory-values",
                    })}
                  >
                    {t("subcategory-values")}
                  </RadioButton>
                </HStack>
                {/*** One value for the sub-sector ***/}
                <Box
                  className={valueType === "one-value" ? undefined : "hidden"}
                >
                  <EmissionsForm
                    t={t}
                    register={register}
                    errors={errors}
                    control={control}
                  />
                </Box>
                {/*** Values for each subcategory ***/}
                <Box
                  className={
                    valueType === "subcategory-values" ? undefined : "hidden"
                  }
                >
                  <TagSelect<Inputs>
                    options={subcategoryOptions}
                    name="subcategories"
                    id="subcategories"
                    placeholder={t("select-subcategories")}
                    rules={{ required: t("subcategories-required") }}
                    control={control}
                  />
                  <Accordion allowToggle mt={12}>
                    {subcategories.map((subcategory, i) => (
                      <AccordionItem key={subcategory.value}>
                        <h2>
                          <AccordionButton>
                            <HStack w="full">
                              <Box as="span" flex="1" textAlign="left" w="full">
                                <Heading size="sm" color="content.alternative">
                                  {subcategory.label}
                                </Heading>
                                <Text color="content.tertiary">
                                  TODO: Get category text body
                                </Text>
                              </Box>
                              <Tag variant={i == 0 ? "success" : "warning"} mx={6}>
                                {i == 0 ? t("completed") : t("incomplete")}
                              </Tag>
                              <AccordionIcon
                                borderWidth={1}
                                boxSize={6}
                                borderRadius="full"
                                borderColor="border.overlay"
                              />
                            </HStack>
                          </AccordionButton>
                        </h2>
                        <AccordionPanel pb={4}>Text</AccordionPanel>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </Box>
              </form>
            </>
          )}
        </Box>
        <Box w="full" py={6} px={12} mt={6} className="border-t-2">
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
        </Box>
      </DrawerContent>
    </Drawer>
  );
}
