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
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Heading,
  Select,
  Spinner,
  Tag,
  Text,
  Textarea,
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
  SubCategoryValueData,
  SubSector,
  SubcategoryData,
} from "./types";
import { resolve } from "@/util/helpers";

type Inputs = {
  valueType: "scope-values" | "unavailable" | "";
  methodology: "activity-data" | "direct-measure" | "";
  energyType: "fuel-combustion" | "grid-supplied-energy";
  unavailableReason:
    | "no-occurrance"
    | "not-estimated"
    | "confidential-information"
    | "presented-elsewhere"
    | "";
  unavailableExplanation: string;
  activity: ActivityData;
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
};

const defaultActivityData: ActivityData = {
  activityDataAmount: undefined,
  activityDataUnit: undefined,
  emissionFactorType: "Local",
  dataQuality: "",
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
  valueType: "scope-values",
  methodology: "",
  energyType: "fuel-combustion",
  unavailableReason: "",
  unavailableExplanation: "",
  activity: defaultActivityData,
  direct: defaultDirectMeasureData,
  subcategoryData: {},
};

function nameToI18NKey(name: string): string {
  return name.replaceAll(" ", "-").toLowerCase();
}

// TODO create custom type that includes relations instead of using SubSectorValueAttributes?
function extractFormValues(subsectorValue: SubSectorValueAttributes): Inputs {
  console.log("Form input", subsectorValue);
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
  const [setSubCategoryValue] = api.useSetSubCategoryValueMutation();

  let noPreviousValue =
    (subsectorValueError as FetchBaseQueryError)?.status === 404;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    reset,
    control,
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (!subsector) return;
    console.log("Subsector data", data);

    // decide which data from the form to save
    if (data.valueType === "unavailable") {
      await setSubsectorValue({
        subSectorId: subsector.subsectorId,
        inventoryId: inventoryId!,
        data: { unavailable: true },
      });
    } else if (data.valueType === "scope-values") {
      // await setSubsectorValue({
      //   subSectorId: subsector.subsectorId,
      //   inventoryId: inventoryId!,
      //   data: {
      //     dataSource: {
      //       sourceType: "user",
      //     },
      //   },
      // });
      const results = await Promise.all(
        Object.keys(data.subcategoryData).map((subcategoryId) => {
          const value = data.subcategoryData[subcategoryId];
          let subCategoryValue: SubCategoryValueData = {
            subcategoryId,
            inventoryId: inventoryId!,
          };

          if (value.methodology === "activity-data") {
            subCategoryValue.activityValue = +value.activity.activityDataAmount!;
            subCategoryValue.activityUnits = value.activity.activityDataUnit;
            // TODO emission factor ID, manual emissions factor values for each gas

            subCategoryValue.dataSource = {
              sourceType: "user",
              dataQuality: value.activity.dataQuality, // TODO map to low/ medium/ high?
              notes: value.activity.sourceReference,
            };
          } else if (data.methodology === "direct-measure") {
            subCategoryValue.co2EmissionsValue = +value.direct.co2Emissions;
            subCategoryValue.ch4EmissionsValue = +value.direct.ch4Emissions;
            subCategoryValue.n2oEmissionsValue = +value.direct.n2oEmissions;
            subCategoryValue.dataSource = {
              sourceType: "user",
              dataQuality: value.direct.dataQuality,
              notes: value.direct.sourceReference,
            };
          } else {
            throw new Error(
              `Methodology for subcategory ${subcategoryId} not selected!`,
            );
          }

          return setSubCategoryValue({
            subCategoryId: subcategoryId,
            inventoryId: inventoryId!,
            data: subCategoryValue,
          });
        }),
      );
      console.log("Save results", results)
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

  const subcategoryData: SubCategory[] | undefined = subsector?.subCategories;
  const scopes = subcategoryData?.map((subcategory: SubCategory) => {
    const name =
      subcategory.subcategoryName?.replace("Emissions from ", "") ||
      "Unknown Subcategory";
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      label,
      value: subcategory.subcategoryId,
    };
  });

  const scopeData = watch("subcategoryData");
  const isScopeCompleted = (scopeId: string) => {
    const data = scopeData[scopeId];
    if (data?.methodology === "activity-data") {
      const activity = data.activity;
      if (!activity) return false;
      return (
        activity.activityDataAmount != null &&
        activity.activityDataUnit != null &&
        activity.emissionFactorType !== "" &&
        !(
          activity.emissionFactorType === "Add custom" &&
          +activity.co2EmissionFactor === 0 &&
          +activity.n2oEmissionFactor === 0 &&
          +activity.ch4EmissionFactor === 0
        ) &&
        activity.dataQuality !== "" &&
        activity.sourceReference !== ""
      );
    } else if (data?.methodology === "direct-measure") {
      if (!data.direct) return false;
      return (
        (data.direct.co2Emissions > 0 ||
          data.direct.ch4Emissions > 0 ||
          data.direct.n2oEmissions > 0) &&
        data.direct.dataQuality !== "" &&
        data.direct.sourceReference !== ""
      );
    }
    return false;
  };

  const valueType = watch("valueType");
  const isSubmitEnabled = !!valueType;

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
                    <FormControl>
                      <FormLabel>
                        {t("value-types")}{" "}
                        {/* TODO content for this Tooltip?
                        <Tooltip
                          hasArrow
                          label={t("value-types-tooltip")}
                          placement="bottom-start"
                        >
                          <InfoOutlineIcon mt={-1} color="content.tertiary" />
                        </Tooltip>
                        */}
                      </FormLabel>
                      <HStack spacing={4} {...getRootProps()}>
                        <RadioButton
                          {...getRadioProps({ value: "scope-values" })}
                        >
                          {t("scope-values")}
                        </RadioButton>
                        <RadioButton
                          {...getRadioProps({ value: "unavailable" })}
                        >
                          {t("unavailable-not-applicable")}
                        </RadioButton>
                      </HStack>
                    </FormControl>
                    {/*** One value for the sub-sector ***/}
                    {valueType === "unavailable" && (
                      <>
                        <FormControl
                          isInvalid={!!resolve("unavailableReason", errors)}
                          mb={12}
                        >
                          <FormLabel>{t("unavailable-reason")}</FormLabel>
                          <Select
                            bgColor="base.light"
                            placeholder={t("unavailable-reason-placeholder")}
                            {...register("unavailableReason", {
                              required: t("option-required"),
                            })}
                          >
                            <option value="no-occurrance">
                              {t("no-occurrance")}
                            </option>
                            <option value="not-estimated">
                              {t("not-estimated")}
                            </option>
                            <option value="confidential-information">
                              {t("confidential-information")}
                            </option>
                            <option value="presented-elsewhere">
                              {t("presented-elsewhere")}
                            </option>
                          </Select>
                          <FormErrorMessage>
                            {resolve("unavailableReason", errors)?.message}
                          </FormErrorMessage>
                        </FormControl>

                        <FormControl
                          isInvalid={
                            !!resolve("unavailableExplanation", errors)
                          }
                        >
                          <FormLabel>{t("unavailable-explanation")}</FormLabel>
                          <Textarea
                            placeholder={t(
                              "unavailable-explanation-placeholder",
                            )}
                            bgColor="base.light"
                            {...register("unavailableExplanation", {
                              required: t("unavailable-explanation-required"),
                            })}
                          />
                          <FormErrorMessage>
                            {resolve("unavailableExplanation", errors)?.message}
                          </FormErrorMessage>
                        </FormControl>
                      </>
                    )}
                    {/*** Values for each scope ***/}
                    {valueType === "scope-values" && (
                      <Accordion allowToggle className="space-y-6">
                        {scopes?.map((scope, i) => (
                          <AccordionItem key={scope.value} mb={0}>
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
                                      {scope.label}
                                    </Heading>
                                    <Text color="content.tertiary">
                                      {/* TODO: Get scope text body */}
                                    </Text>
                                  </Box>
                                  {isScopeCompleted(scope.value) ? (
                                    <Tag variant="success" mx={6}>
                                      {t("completed")}
                                    </Tag>
                                  ) : (
                                    <Tag variant="warning" mx={6}>
                                      {t("incomplete")}
                                    </Tag>
                                  )}
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
                                prefix={`subcategoryData.${scope.value}.`}
                                watch={watch}
                                sectorNumber={sectorNumber!}
                              />
                            </AccordionPanel>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                    <Box w="full" className="grow flex flex-col">
                      <Box className="grow" />
                      <Button
                        onClick={handleSubmit(onSubmit)}
                        isDisabled={!isSubmitEnabled}
                        isLoading={isSubmitting}
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
