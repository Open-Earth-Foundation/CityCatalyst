import "@/util/bigint";

import { api } from "@/services/api";
import { logger } from "@/services/logger";
import { nameToI18NKey, resolvePromisesSequentially } from "@/util/helpers";
import type { InventoryValueResponse } from "@/util/types";
import { ArrowBackIcon, CloseIcon, WarningIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Center,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  Flex,
  HStack,
  Heading,
  IconButton,
  Spinner,
  Tag,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { TFunction } from "i18next";
import type { RefObject } from "react";
import React, { useEffect } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { EmissionsForm } from "./EmissionsForm";
import type {
  ActivityData,
  DirectMeasureData,
  SubCategory,
  InventoryValueData,
  SubSector,
  SubcategoryData,
  EmissionsFactorData,
  GasValueData,
} from "./types";
import { Trans } from "react-i18next/TransWithoutContext";
import { determineEmissionsFactorType } from "./ActivityDataTab";

type Inputs = {
  methodology: "activity-data" | "direct-measure" | "";
  energyType: "fuel-combustion" | "grid-supplied-energy";
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
  co2Emissions: 0n,
  ch4Emissions: 0n,
  n2oEmissions: 0n,
  dataQuality: "",
  sourceReference: "",
};

const defaultValues: Inputs = {
  methodology: "",
  energyType: "fuel-combustion",
  activity: defaultActivityData,
  direct: defaultDirectMeasureData,
  subcategoryData: {},
};

function extractFormValues(inventoryValues: InventoryValueResponse[]): Inputs {
  logger.debug("Form input", inventoryValues);
  const inputs: Inputs = Object.assign({}, defaultValues);
  inputs.subcategoryData = inventoryValues.reduce(
    (record: Record<string, SubcategoryData>, value: InventoryValueData) => {
      const methodology =
        value.activityValue != null ? "activity-data" : "direct-measure";
      const data: SubcategoryData = {
        methodology,
        isUnavailable: !!value.unavailableReason,
        unavailableReason: (value.unavailableReason as any) || "",
        unavailableExplanation: value.unavailableExplanation || "",
        activity: { ...defaultActivityData },
        direct: { ...defaultDirectMeasureData },
      };

      if (methodology === "activity-data") {
        data.activity.activityDataAmount = value.activityValue;
        data.activity.activityDataUnit = value.activityUnits;
        // TODO emission factor ID, manual emissions factor values for each gas
        data.activity.dataQuality = value.dataSource?.dataQuality || "";
        data.activity.sourceReference = value.dataSource?.notes || "";

        const emissionsFactorsByGas = (value.gasValues || []).reduce(
          (acc, gasValue) => {
            if (gasValue.gas != null && gasValue.emissionsFactor != null) {
              acc[gasValue.gas] = gasValue.emissionsFactor;
            }
            return acc;
          },
          {} as Record<string, EmissionsFactorData>,
        );
        data.activity.co2EmissionFactor =
          emissionsFactorsByGas.CO2?.emissionsPerActivity || 0;
        data.activity.ch4EmissionFactor =
          emissionsFactorsByGas.CH4?.emissionsPerActivity || 0;
        data.activity.n2oEmissionFactor =
          emissionsFactorsByGas.N2O?.emissionsPerActivity || 0;

        // TODO validate if all of these have equal units and types
        const emissionsFactors = Object.values(emissionsFactorsByGas);
        const isCustom = emissionsFactors.every(
          (factor) => factor.inventoryId != null,
        );
        data.activity.emissionFactorType = isCustom
          ? "custom"
          : determineEmissionsFactorType(emissionsFactors[0]);
        data.activity.activityDataUnit = emissionsFactors[0]?.units;
      } else if (methodology === "direct-measure") {
        const gasToEmissions = (value.gasValues || []).reduce(
          (acc: Record<string, bigint>, value) => {
            acc[value.gas!] = BigInt(value.gasAmount || 0n);
            return acc;
          },
          {},
        );
        data.direct.co2Emissions = (gasToEmissions.CO2 || 0n) / 1000n;
        data.direct.ch4Emissions = (gasToEmissions.CH4 || 0n) / 1000n;
        data.direct.n2oEmissions = (gasToEmissions.N2O || 0n) / 1000n;
        data.direct.dataQuality = value.dataSource?.dataQuality || "";
        data.direct.sourceReference = value.dataSource?.notes || "";
      }

      record[value.subCategoryId!] = data;
      return record;
    },
    {},
  );
  logger.debug("Form values", inputs);
  return inputs;
}

const isScopeCompleted = (
  scopeId: string,
  scopeData: Inputs["subcategoryData"],
) => {
  const data = scopeData[scopeId];
  if (data?.isUnavailable) {
    return !!data.unavailableExplanation && !!data.unavailableReason;
  } else if (data?.methodology === "activity-data") {
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

export function SubsectorDrawer({
  subSector,
  sectorName,
  inventoryId,
  isOpen,
  onClose,
  finalFocusRef,
  onSave,
  t,
}: {
  subSector?: SubSector;
  sectorName?: string;
  inventoryId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (subsector: SubSector, data: Inputs) => void;
  finalFocusRef?: RefObject<any>;
  t: TFunction;
}) {
  const subCategoryIds = subSector?.subCategories.map((c) => c.subcategoryId);
  const {
    data: inventoryValues,
    isLoading: isSubsectorValueLoading,
    error: inventoryValueError,
  } = api.useGetInventoryValuesQuery(
    { subCategoryIds: subCategoryIds!, inventoryId: inventoryId! },
    { skip: !subSector || !inventoryId },
  );
  const { data: emissionsFactors, isLoading: areEmissionsFactorsLoading } =
    api.useGetEmissionsFactorsQuery();
  const [setInventoryValue] = api.useSetInventoryValueMutation();

  let noPreviousValue =
    (inventoryValueError as FetchBaseQueryError)?.status === 404;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    watch,
    reset,
    control,
    setValue,
  } = useForm<Inputs>();

  const scopeData = watch("subcategoryData");

  const onTryClose = () => {
    if (isDirty) {
      onDialogOpen();
    } else {
      onClose();
    }
  };

  const toast = useToast();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (!subSector) return;
    logger.debug("Subsector data", data);

    const results = await resolvePromisesSequentially(
      Object.keys(data.subcategoryData).map((subCategoryId) => {
        const value = data.subcategoryData[subCategoryId];

        // decide which data from the form to save
        if (value.isUnavailable) {
          return setInventoryValue({
            subCategoryId,
            inventoryId: inventoryId!,
            data: {
              unavailableReason: value.unavailableReason,
              unavailableExplanation: value.unavailableExplanation,
            },
          });
        } else {
          if (!isScopeCompleted(subCategoryId, scopeData)) {
            logger.error(`Data not completed for scope ${subCategoryId}!`);
            return Promise.resolve();
          }

          let inventoryValue: InventoryValueData = {
            subCategoryId,
            inventoryId: inventoryId!,
            unavailableReason: "",
            unavailableExplanation: "",
          };

          if (value.methodology === "activity-data") {
            inventoryValue.activityValue = +value.activity.activityDataAmount!;
            inventoryValue.activityUnits = value.activity.activityDataUnit;
            // TODO emission factor ID, manual emissions factor values for each gas

            inventoryValue.dataSource = {
              sourceType: "user",
              dataQuality: value.activity.dataQuality,
              notes: value.activity.sourceReference,
            };

            // save emissions factors (either values for custom or the IDs for each gas for predefined)
            const gases = ["CO2", "CH4", "N2O"];
            inventoryValue.gasValues = gases.flatMap((gas) => {
              let gasValue: GasValueData = {
                gas,
                gasAmount: null, // remove previous data
              };
              if (value.activity.emissionFactorType === "custom") {
                const emissionsPerActivity = Number(
                  (value.activity as unknown as Record<string, string>)[
                    gas.toLowerCase() + "EmissionFactor"
                  ],
                );
                gasValue.emissionsFactor = {
                  emissionsPerActivity,
                  gas,
                  units: value.activity.activityDataUnit || undefined,
                  inventoryId: inventoryId,
                };
              } else {
                if (!emissionsFactors || !scopes) {
                  throw new Error(
                    "Emissions factors or scopes not loaded at save time!",
                  );
                }
                const subCategory = scopes?.find(
                  (scope) => scope.value === subCategoryId,
                );
                const gpcReferenceNumber = subCategory?.gpcReferenceNumber;
                const factors = emissionsFactors.filter((factor) => {
                  return (
                    factor.gas === gas &&
                    factor.units === value.activity.activityDataUnit &&
                    factor.gpcReferenceNumber === gpcReferenceNumber &&
                    determineEmissionsFactorType(factor) ===
                      value.activity.emissionFactorType
                  );
                });

                if (factors.length === 0) {
                  return [];
                }
                if (factors.length > 1) {
                  logger.warn(
                    `Multiple emissions factor candidates for scope ${gpcReferenceNumber}, units ${value.activity.activityDataUnit}, type ${value.activity.emissionFactorType}`,
                    factors,
                  );
                }

                gasValue.emissionsFactorId = factors[0].id;
              }
              return [gasValue];
            });
          } else if (value.methodology === "direct-measure") {
            inventoryValue.activityValue = null;
            inventoryValue.activityUnits = null;
            inventoryValue.gasValues = [
              {
                gas: "CO2",
                gasAmount: BigInt(value.direct.co2Emissions) * 1000n,
              },
              {
                gas: "CH4",
                gasAmount: BigInt(value.direct.ch4Emissions) * 1000n,
              },
              {
                gas: "N2O",
                gasAmount: BigInt(value.direct.n2oEmissions) * 1000n,
              },
            ];
            inventoryValue.dataSource = {
              sourceType: "user",
              dataQuality: value.direct.dataQuality,
              notes: value.direct.sourceReference,
            };
          } else {
            logger.error(
              `Methodology for subcategory ${subCategoryId} not selected!`,
            );
            return Promise.resolve();
          }

          return setInventoryValue({
            subCategoryId: subCategoryId,
            inventoryId: inventoryId!,
            data: inventoryValue,
          });
        }
      }),
    );
    logger.debug("Save results", results);
    let hadError = false;
    for (const [index, result] of results.entries()) {
      if (result?.error?.status > 200) {
        hadError = true;
        const scopeId = Object.keys(data.subcategoryData)[index];
        const scopeName = scopes?.find((s) => s.value === scopeId)?.label || "";
        toast({
          title: `Failed to save "${scopeName}"`,
          description:
            "There was an error during saving. Please notify the support about this.",
          status: "error",
          isClosable: true,
          duration: null,
        });
      }
    }
    if (!hadError) {
      onSave(subSector, data);
      onClose();
    }
  };

  // reset form values when choosing another subsector
  useEffect(() => {
    if (inventoryValues) {
      // TODO store previous form values if it's unsaved?
      reset(extractFormValues(inventoryValues));
    } else {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryValues, subSector]);

  const subcategoryData: SubCategory[] | undefined = subSector?.subCategories;
  const scopes = subcategoryData?.map((subcategory: SubCategory) => {
    const name =
      subcategory.subcategoryName?.replace("Emissions from ", "") ||
      "Unknown Subcategory";
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      label,
      value: subcategory.subcategoryId,
      gpcReferenceNumber: subcategory.referenceNumber,
    };
  });

  const {
    isOpen: isDialogOpen,
    onOpen: onDialogOpen,
    onClose: onDialogClose,
  } = useDisclosure();
  const cancelDialogRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      onEsc={onTryClose}
      onOverlayClick={onTryClose}
      closeOnEsc={false}
      closeOnOverlayClick={false}
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
            onClick={onTryClose}
            px={6}
            py={4}
            mb={6}
          >
            {t("go-back")}
          </Button>
          {subSector && (
            <>
              {sectorName && (
                <Heading size="sm">
                  {t("sector")} - {t(nameToI18NKey(sectorName))}
                </Heading>
              )}
              <Heading fontSize="32px" fontWeight="bold" lineHeight="40px">
                {t(nameToI18NKey(subSector.subsectorName))}
              </Heading>
              <Text color="content.tertiary">
                {t(nameToI18NKey(subSector.subsectorName) + "-description")}
              </Text>
              {isSubsectorValueLoading || areEmissionsFactorsLoading ? (
                <Center>
                  <Spinner size="lg" />
                </Center>
              ) : inventoryValueError && !noPreviousValue ? (
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
                    <Accordion allowToggle className="space-y-6">
                      {scopes?.map((scope) => (
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
                                {isScopeCompleted(scope.value, scopeData) ? (
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
                              setValue={setValue}
                              gpcReferenceNumber={scope.gpcReferenceNumber!}
                              emissionsFactors={emissionsFactors!}
                            />
                          </AccordionPanel>
                        </AccordionItem>
                      ))}
                    </Accordion>
                    <Box w="full" className="grow flex flex-col">
                      <Box className="grow" />
                      <Button
                        onClick={handleSubmit(onSubmit)}
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
      <AlertDialog
        isOpen={isDialogOpen}
        onClose={onDialogClose}
        leastDestructiveRef={cancelDialogRef}
      >
        <AlertDialogOverlay>
          <AlertDialogContent minWidth={568}>
            <AlertDialogHeader
              fontSize="24"
              fontWeight="600"
              textAlign="center"
              fontFamily="heading"
              my={2}
            >
              <Flex justify="space-between">
                <Box w={10} />
                {t("unsaved-changes")}
                <IconButton
                  color="content.tertiary"
                  icon={<CloseIcon />}
                  onClick={onDialogClose}
                  aria-label="Close"
                  variant="ghost"
                />
              </Flex>
            </AlertDialogHeader>
            <hr />
            <AlertDialogBody textAlign="center" py={6} px={10}>
              <Trans i18nKey="unsaved-changes-description" t={t} />
            </AlertDialogBody>
            <hr />

            <AlertDialogFooter my={2}>
              <Flex justify="center" w="full">
                <Button
                  variant="outline"
                  ref={cancelDialogRef}
                  onClick={onDialogClose}
                  px={6}
                  width="230px"
                  height={16}
                >
                  {t("keep-editing")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    onClose();
                    onDialogClose();
                  }}
                  ml={2}
                  px={6}
                  width="230px"
                  height={16}
                >
                  {t("discard-changes")}
                </Button>
              </Flex>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Drawer>
  );
}
