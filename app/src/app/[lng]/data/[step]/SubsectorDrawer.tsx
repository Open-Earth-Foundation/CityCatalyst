import { TagSelect } from "@/components/TagSelect";
import { RadioButton } from "@/components/radio-button";
import type { SubSectorValueAttributes } from "@/models/SubSectorValue";
import { api } from "@/services/api";
import { ArrowBackIcon, InfoOutlineIcon, WarningIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Center,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  HStack,
  Heading,
  Spinner,
  Tag,
  Text,
  Tooltip,
  useRadioGroup,
} from "@chakra-ui/react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { TFunction } from "i18next";
import type { RefObject } from "react";
import { useEffect } from "react";
import { SubmitHandler, useController, useForm } from "react-hook-form";
import { EmissionsForm } from "./EmissionsForm";
import type {
  ActivityData,
  DirectMeasureData,
  SubCategory,
  SubSector,
  SubcategoryData,
  SubcategoryOption,
} from "./types";

type Inputs = {
  valueType: "one-value" | "subcategory-values" | "";
  methodology: "activity-data" | "direct-measure" | "";
  energyType: "fuel-combustion" | "grid-supplied-energy";
  fuel: ActivityData;
  grid: ActivityData;
  direct: DirectMeasureData;
  subcategories: SubcategoryOption[];
  subcategoryData: Record<string, SubcategoryData>;
};

const defaultActivityData: ActivityData = {
  activityDataAmount: undefined,
  activityDataUnit: undefined,
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
  energyType: "fuel-combustion",
  subcategories: [],
  fuel: defaultActivityData,
  grid: defaultActivityData,
  direct: defaultDirectMeasureData,
  subcategoryData: {},
};

function nameToI18NKey(name: string): string {
  return name.replaceAll(" ", "-").toLowerCase();
}

// TODO create custom type that includes relations instead of using SubSectorValueAttributes?
function extractFormValues(subsectorValue: SubSectorValueAttributes): Inputs {
  return defaultValues; // TODO update with data
}

export function SubsectorDrawer({
  subsector,
  sectorName,
  sectorNumber,
  inventoryId,
  isOpen,
  onClose,
  finalFocusRef,
  onSave,
  t,
}: {
  subsector?: SubSector;
  sectorName?: string;
  sectorNumber?: string; // I, II, III
  inventoryId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (subsector: SubSector, data: Inputs) => void;
  finalFocusRef?: RefObject<any>;
  t: TFunction;
}) {
  const {
    data: subsectorValue,
    isLoading: isSubsectorValueLoading,
    error: subsectorValueError,
  } = api.useGetSubsectorValueQuery(
    { subSectorId: subsector?.subsectorId!, inventoryId: inventoryId! },
    { skip: !subsector || !inventoryId },
  );
  const [setSubsectorValue, { isLoading: isSaving }] =
    api.useSetSubsectorValueMutation();

  let noPreviousValue =
    (subsectorValueError as FetchBaseQueryError)?.status === 404;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
    reset,
    control,
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (!subsector) return;
    console.log("Subsector data", data);

    // decide which data from the form to save
    if (data.valueType === "one-value") {
      let subSectorData;

      if (data.methodology === "activity-data") {
        subSectorData =
          data.energyType === "fuel-combustion" ? data.fuel : data.grid;
      } else if (data.methodology === "direct-measure") {
        subSectorData = data.direct;
      } else {
        throw new Error("Methodology not selected!");
      }

      await setSubsectorValue({
        subSectorId: subsector.subsectorId,
        inventoryId: inventoryId!,
        data: subSectorData,
      });
    } else if (data.valueType === "subcategory-values") {
      for (const subCategoryId in data.subcategoryData) {
        const value = data.subcategoryData[subCategoryId];
        let subCategoryData;

        if (value.methodology === "activity-data") {
          subCategoryData =
            value.energyType === "fuel-combustion" ? value.fuel : value.grid;
        } else if (data.methodology === "direct-measure") {
          subCategoryData = value.direct;
        } else {
          throw new Error(
            `Methodology for subcategory ${subCategoryId} not selected!`,
          );
        }
      }
    }
    onSave(subsector, data);
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
    if (subsectorValue) {
      // TODO store previous form values if it's unsaved?
      reset(extractFormValues(subsectorValue));
    } else {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsectorValue, subsector]);

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
              {sectorName && (
                <Heading size="sm">
                  {t("sector")} - {t(sectorName)}
                </Heading>
              )}
              <Heading size="lg">{t(subsector.subsectorName)}</Heading>
              <Text color="content.tertiary">
                {t(nameToI18NKey(subsector.subsectorName) + "-description")}
              </Text>
              {isSubsectorValueLoading ? (
                <Center>
                  <Spinner size="lg" />
                </Center>
              ) : subsectorValueError && !noPreviousValue ? (
                <Center>
                  <HStack mt={4}>
                    <WarningIcon boxSize={7} color="semantic.danger" />
                    <Text color="semantic.danger">
                      {t("load-failed-subsector-value")}
                    </Text>
                  </HStack>
                </Center>
              ) : (
                <>
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
                        setValue={setValue}
                        errors={errors}
                        control={control}
                        watch={watch}
                        sectorNumber={sectorNumber!}
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
                                      {i == 0
                                        ? t("completed")
                                        : t("incomplete")}
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
                                  setValue={setValue}
                                  errors={errors}
                                  control={control}
                                  prefix={`subcategoryData.${subcategory.value}.`}
                                  watch={watch}
                                  sectorNumber={sectorNumber!}
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
            </>
          )}
        </Box>
      </DrawerContent>
    </Drawer>
  );
}
