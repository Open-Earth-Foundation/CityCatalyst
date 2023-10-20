import { TagSelect } from "@/components/TagSelect";
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
  Divider,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  HStack,
  Heading,
  Tag,
  Text,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { RefObject, useEffect, useState } from "react";
import { SubmitHandler, useController, useForm } from "react-hook-form";
import { EmissionsForm } from "./EmissionsForm";

type Inputs = {
  valueType: string;
  methodology: string;
  subcategories: SubcategoryOption[];
  fuel: ActivityData;
  grid: ActivityData;
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
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

const defaultDirectMeasureData: DirectMeasureData = {
  co2Emissions: 0,
  ch4Emissions: 0,
  n2oEmissions: 0,
  dataQuality: "",
  sourceReference: "",
};

const defaultValues: Inputs = {
  valueType: "",
  methodology: "",
  subcategories: [],
  fuel: defaultActivityData,
  grid: defaultActivityData,
  direct: defaultDirectMeasureData,
  subcategoryData: {},
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
    { subcategoryId: "1337a", subcategoryName: "Manufacturing" },
    { subcategoryId: "1338b", subcategoryName: "Industrial facilities" },
    { subcategoryId: "1339c", subcategoryName: "Construction activities" },
  ];
  const subcategoryOptions = subcategoryData.map(
    (subcategory: SubCategory) => ({
      label: subcategory.subcategoryName,
      value: subcategory.subcategoryId,
    }),
  );

  const valueType = watch("valueType");
  const methodology = watch("methodology");
  const isSubmitEnabled =
    !!valueType && (!!methodology || valueType == "subcategory-values");
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
      <DrawerContent px={0} py={0} minH="full" className="overflow-auto">
        <Box px={16} pt={12} minH="full" className="space-y-6 flex flex-col">
          <Button
            variant="ghost"
            leftIcon={<ArrowBackIcon boxSize={6} />}
            className="self-start"
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
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-6 grow flex flex-col"
              >
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
                {valueType === "one-value" && (
                  <EmissionsForm
                    t={t}
                    register={register}
                    errors={errors}
                    control={control}
                  />
                )}
                {/*** Values for each subcategory ***/}
                {valueType === "subcategory-values" && (
                  <>
                    <TagSelect<Inputs>
                      options={subcategoryOptions}
                      name="subcategories"
                      id="subcategories"
                      placeholder={t("select-subcategories")}
                      rules={{ required: t("subcategories-required") }}
                      control={control}
                    />
                    <Accordion allowToggle className="space-y-6">
                      {subcategories.map((subcategory, i) => (
                        <AccordionItem key={subcategory.value} mb={0}>
                          <h2>
                            <AccordionButton>
                              <HStack w="full">
                                <Box
                                  as="span"
                                  flex="1"
                                  textAlign="left"
                                  w="full"
                                >
                                  <Heading
                                    size="sm"
                                    color="content.alternative"
                                  >
                                    {subcategory.label}
                                  </Heading>
                                  <Text color="content.tertiary">
                                    TODO: Get category text body
                                  </Text>
                                </Box>
                                <Tag
                                  variant={i == 0 ? "success" : "warning"}
                                  mx={6}
                                >
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
                          <AccordionPanel pt={4}>
                            <EmissionsForm
                              t={t}
                              register={register}
                              errors={errors}
                              control={control}
                              prefix={`subcategoryData.${subcategory.value}.`}
                            />
                          </AccordionPanel>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </>
                )}
                <Box w="full" className="grow flex flex-col">
                  <Box className="grow" />
                  <Button
                    onClick={handleSubmit(onSubmit)}
                    isDisabled={!isSubmitEnabled}
                    isLoading={isSaving}
                    type="submit"
                    formNoValidate
                    w="full"
                    h={16}
                    mb={12}
                    mt={6}
                  >
                    {t("add-data")}
                  </Button>
                </Box>
              </form>
            </>
          )}
        </Box>
      </DrawerContent>
    </Drawer>
  );
}
