"use client";

import { api } from "@/services/api";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Heading,
  InputGroup,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { FC, useMemo, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { TFunction } from "i18next";
import BuildingTypeSelectInput from "../building-select-input";
import {
  CheckCircleIcon,
  InfoOutlineIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { Trans } from "react-i18next";
import Link from "next/link";

import type {
  DirectMeasureData,
  SubcategoryData,
  EmissionsFactorData,
} from "../../app/[lng]/[inventory]/data/[step]/types";
import { getInputMethodology, resolve } from "@/util/helpers";
import type { SuggestedActivity } from "@/util/form-schema";
import { Methodology } from "@/util/form-schema";
import { getTranslationFromDict } from "@/i18n";

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  defaultCityId?: string;
  setHasActivityData: Function;
  hasActivityData: boolean;
  inventoryId: string;
  methodology: any;
  selectedActivity?: SuggestedActivity;
  referenceNumber: string;
}

export type Inputs = {
  activity: {
    activityDataAmount?: number | null | undefined;
    activityDataUnit?: string | null | undefined;
    emissionFactorType?: string;
    CO2EmissionFactor: number;
    N2OEmissionFactor: number;
    CH4EmissionFactor: number;
    dataQuality: string;
    sourceReference: string;
    buildingType: string;
    fuelType: string;
    totalFuelConsumption?: string | undefined;
    totalFuelConsumptionUnits: string;
    co2EmissionFactorUnit: string;
    n2oEmissionFactorUnit: string;
    ch4EmissionFactorUnit: string;
  };
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
};

const AddActivityModal: FC<AddActivityModalProps> = ({
  isOpen,
  onClose,
  t,
  setHasActivityData,
  hasActivityData,
  inventoryId,
  methodology,
  selectedActivity,
  referenceNumber,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty, isValid },
    watch,
    reset,
    control,
    setValue,
  } = useForm<Inputs>();

  let prefix = "";
  let { data: emissionsFactors, isLoading: emissionsFactorsLoading } =
    api.useGetEmissionsFactorsQuery();
  // extract and deduplicate data sources from emissions factors
  const emissionsFactorTypes = useMemo(() => {
    if (!emissionsFactors) {
      return [];
    }
    const seen: Record<string, boolean> = {};
    return emissionsFactors
      .flatMap((factor) => {
        return factor.dataSources.map((source) => ({
          id: source.datasourceId,
          name: getTranslationFromDict(source.datasetName) ?? "unknown",
        }));
      })
      .filter((source) => {
        return seen.hasOwnProperty(source.id)
          ? false
          : (seen[source.id] = true);
      });
  }, [emissionsFactors]);

  const toast = useToast();

  const [createActivityValue, { isLoading }] =
    api.useCreateActivityValueMutation();

  function extractGasesAndUnits(data: any) {
    const gases = ["CH4", "CO2", "N2O"];
    const gasArray: { gas: string; factor: number; unit: string }[] = [];
    gases.forEach((gas) => {
      const gasFactorKey = `${gas}EmissionFactor`;
      const gasUnitKey = `${gas}EmissionFactorUnit`;
      const gasObject = {
        gas: gas,
        factor: data[gasFactorKey],
        unit: data[gasUnitKey],
      };

      gasArray.push(gasObject);
    });
    return gasArray;
  }

  const onSubmit: SubmitHandler<Inputs> = async ({ activity }) => {
    const gasValues = extractGasesAndUnits(activity);
    const requestData = {
      activityData: {
        co2_amount: gasValues[1].factor,
        ch4_amount: gasValues[0].factor,
        n2o_amount: gasValues[2].factor,
        activity_type: activity.buildingType,
        fuel_type: activity.fuelType,
      },
      metadata: {},
      inventoryValue: {
        inputMethodology: getInputMethodology(methodology?.id), // extract methodology name
        gpcReferenceNumber: referenceNumber,
        unavailableReason: "",
        unavailableExplanation: "",
      },
      dataSource: {
        sourceType: "",
        dataQuality: activity.dataQuality,
        notes: activity.sourceReference,
      },
      gasValues: gasValues.map(({ gas, factor, unit }) => ({
        gas,
        gasAmount: factor,
        emissionsFactor: {
          gas,
          unit,
          gpcReferenceNumber: referenceNumber,
        },
      })),
    };

    await createActivityValue({ inventoryId, requestData }).then((res: any) => {
      if (res.data) {
        setHasActivityData(!hasActivityData);
        toast({
          status: "success",
          duration: 1200,
          title: "New activity data successfully added!",
          render: ({ title }) => (
            <Box
              h="48px"
              w="600px"
              borderRadius="8px"
              display="flex"
              alignItems="center"
              color="white"
              backgroundColor="interactive.primary"
              gap="8px"
              px="16px"
            >
              <CheckCircleIcon />
              <Text>{title}</Text>
            </Box>
          ),
        });
        onClose();
      } else {
        toast({
          status: "error",
          title: "Something went wrong!",
        });
      }
    });
  };

  const [isEmissionFactorInputDisabled, setIsEmissionFactorInputDisabled] =
    useState<boolean>(true);

  // Adjust function for countries with national emission factors i.e US
  const onEmissionFactorTypeChange = (e: any) => {
    const emissionFactorType = e.target.value;
    if (emissionFactorType === "custom") {
      setIsEmissionFactorInputDisabled(false);
    } else {
      setIsEmissionFactorInputDisabled(true);
    }
  };

  let fields = null;
  let units = null;
  if (methodology?.id.includes("direct-measure")) {
    fields = methodology.fields;
  } else {
    fields = methodology?.fields[0]["extra-fields"];
    units = methodology?.fields[0].units;
  }

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent
          data-testid="add-emission-modal"
          minH="300px"
          minW="768px"
          marginTop="2%"
        >
          <ModalHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            fontFamily="heading"
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {t("add-emission-data")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody p={6} px={12}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <HStack
                spacing={4}
                mb="24px"
                display="flex"
                flexDirection="column"
                className="items-start"
                gap="24px"
              >
                <FormControl className="w-full">
                  <BuildingTypeSelectInput
                    options={fields?.[0].options}
                    title={fields?.[0].id}
                    placeholder={t("select-activity-type")}
                    register={register}
                    activity={"activity.buildingType"}
                    errors={errors}
                    t={t}
                    selectedActivity={selectedActivity}
                  />
                </FormControl>
                <FormControl>
                  <BuildingTypeSelectInput
                    options={fields?.[1].options}
                    title={fields?.[1].id}
                    placeholder={t("select-type-of-fuel")}
                    register={register}
                    activity={"activity.fuelType"}
                    errors={errors}
                    t={t}
                  />
                </FormControl>
                {!methodology?.id.includes("direct-measure") ? (
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    gap="16px"
                    w="full"
                  >
                    <FormControl
                      isInvalid={
                        !!resolve(prefix + "activityDataAmount", errors)
                      }
                    >
                      <FormLabel className="truncate">
                        {fields?.[2].id}
                      </FormLabel>
                      <InputGroup>
                        <NumberInput defaultValue={0} w="full">
                          <NumberInputField
                            borderRadius="4px"
                            placeholder={t("activity-data-amount-placeholder")}
                            borderRightRadius={0}
                            h="48px"
                            shadow="1dp"
                            borderWidth={
                              errors?.activity?.totalFuelConsumption ? "1px" : 0
                            }
                            border="inputBox"
                            borderColor={
                              errors?.activity?.totalFuelConsumption
                                ? "sentiment.negativeDefault"
                                : ""
                            }
                            background={
                              errors?.activity?.totalFuelConsumption
                                ? "sentiment.negativeOverlay"
                                : ""
                            }
                            bgColor="base.light"
                            _focus={{
                              borderWidth: "1px",
                              shadow: "none",
                              borderColor: "content.link",
                            }}
                            {...register("activity.totalFuelConsumption")}
                          />
                        </NumberInput>
                        <InputRightAddon
                          className="border-l-2"
                          pl={4}
                          pr={0}
                          bgColor="base.light"
                          h="48px"
                          shadow="1dp"
                        >
                          <Select
                            variant="unstyled"
                            {...register("activity.totalFuelConsumptionUnits")}
                          >
                            {units?.map((item: string) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Select>
                        </InputRightAddon>
                      </InputGroup>

                      {errors.activity?.totalFuelConsumption ? (
                        <Box
                          display="flex"
                          gap="6px"
                          alignItems="center"
                          mt="6px"
                        >
                          <WarningIcon color="sentiment.negativeDefault" />
                          <Text fontSize="body.md">Please enter amount</Text>
                        </Box>
                      ) : (
                        ""
                      )}
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("emission-factor-type")}</FormLabel>
                      <Select
                        borderRadius="4px"
                        borderWidth={
                          errors?.activity?.emissionFactorType ? "1px" : 0
                        }
                        border="inputBox"
                        h="48px"
                        shadow="1dp"
                        borderColor={
                          errors?.activity?.emissionFactorType
                            ? "sentiment.negativeDefault"
                            : ""
                        }
                        background={
                          errors?.activity?.emissionFactorType
                            ? "sentiment.negativeOverlay"
                            : ""
                        }
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                        {...register("activity.emissionFactorType")}
                        bgColor="base.light"
                        placeholder="Select emission factor type"
                        onChange={(e: any) => onEmissionFactorTypeChange(e)}
                      >
                        {emissionsFactorTypes.map(({ id, name }) => (
                          <option key={id} value={id}>
                            {t(name)}
                          </option>
                        ))}
                        <option key="custom" value="custom">
                          {t("add-custom")}
                        </option>
                      </Select>
                      {errors.activity?.emissionFactorType ? (
                        <Box
                          display="flex"
                          gap="6px"
                          alignItems="center"
                          mt="6px"
                        >
                          <WarningIcon color="sentiment.negativeDefault" />
                          <Text fontSize="body.md">
                            Please select an emission factor type
                          </Text>
                        </Box>
                      ) : (
                        ""
                      )}
                    </FormControl>
                  </Box>
                ) : null}
              </HStack>
              {!methodology?.id.includes("direct-measure") ? (
                <>
                  <Heading
                    size="sm"
                    mb={4}
                    className="font-normal"
                    display="flex"
                    alignItems="center"
                  >
                    <FormLabel
                      variant="label"
                      fontSize="label.lg"
                      fontStyle="normal"
                      fontWeight="medium"
                      letterSpacing="wide"
                      fontFamily="heading"
                    >
                      {t("emissions-factor-values")}
                    </FormLabel>
                  </Heading>
                  <HStack spacing={4} mb={5}>
                    <FormControl>
                      <FormLabel color="content.tertiary">
                        {t("co2-emission-factor")}
                      </FormLabel>
                      <InputGroup>
                        {/* TODO translate values and use internal value for checking */}
                        <NumberInput
                          defaultValue={0}
                          min={0}
                          isDisabled={isEmissionFactorInputDisabled}
                        >
                          <NumberInputField
                            h="48px"
                            type="number"
                            shadow="1dp"
                            borderRightRadius={0}
                            {...register("activity.CO2EmissionFactor")}
                            bgColor={
                              isEmissionFactorInputDisabled
                                ? "background.neutral"
                                : "base.light"
                            }
                            pos="relative"
                            zIndex={999}
                          />
                        </NumberInput>
                        <InputRightAddon
                          bgColor={
                            isEmissionFactorInputDisabled
                              ? "background.neutral"
                              : "base.light"
                          }
                          color="content.tertiary"
                          h="48px"
                          shadow="1dp"
                          pos="relative"
                          zIndex={10}
                          {...register("activity.co2EmissionFactorUnit")}
                        >
                          {""}
                        </InputRightAddon>
                      </InputGroup>
                    </FormControl>
                    <FormControl>
                      <FormLabel color="content.tertiary">
                        {t("n2o-emission-factor")}
                      </FormLabel>
                      <InputGroup>
                        <NumberInput
                          defaultValue={0}
                          min={0}
                          isDisabled={isEmissionFactorInputDisabled}
                        >
                          <NumberInputField
                            _focus={{
                              borderWidth: "1px",
                              shadow: "none",
                              borderColor: "content.link",
                            }}
                            borderRightRadius={0}
                            {...register("activity.N2OEmissionFactor")}
                            bgColor={
                              isEmissionFactorInputDisabled
                                ? "background.neutral"
                                : "base.light"
                            }
                            h="48px"
                            shadow="1dp"
                            pos="relative"
                            zIndex={999}
                          />
                        </NumberInput>
                        <InputRightAddon
                          bgColor={
                            isEmissionFactorInputDisabled
                              ? "background.neutral"
                              : "base.light"
                          }
                          color="content.tertiary"
                          h="48px"
                          shadow="1dp"
                          pos="relative"
                          zIndex={10}
                          {...register("activity.n2oEmissionFactorUnit")}
                        >
                          {""}
                        </InputRightAddon>
                      </InputGroup>
                    </FormControl>
                    <FormControl>
                      <FormLabel color="content.tertiary">
                        {t("ch4-emission-factor")}
                      </FormLabel>
                      <InputGroup>
                        <NumberInput
                          defaultValue={0}
                          min={0}
                          isDisabled={isEmissionFactorInputDisabled}
                        >
                          <NumberInputField
                            _focus={{
                              borderWidth: "1px",
                              shadow: "none",
                              borderColor: "content.link",
                            }}
                            borderRightRadius={0}
                            {...register("activity.CH4EmissionFactor")}
                            bgColor={
                              isEmissionFactorInputDisabled
                                ? "background.neutral"
                                : "base.light"
                            }
                            h="48px"
                            shadow="1dp"
                            pos="relative"
                            zIndex={999}
                          />
                        </NumberInput>
                        <InputRightAddon
                          bgColor={
                            isEmissionFactorInputDisabled
                              ? "background.neutral"
                              : "base.light"
                          }
                          color="content.tertiary"
                          h="48px"
                          shadow="1dp"
                          pos="relative"
                          zIndex={10}
                          {...register("activity.ch4EmissionFactorUnit")}
                        >
                          {""}
                        </InputRightAddon>
                      </InputGroup>
                    </FormControl>
                  </HStack>{" "}
                </>
              ) : (
                <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={5}>
                  <FormControl w="full">
                    <FormLabel color="content.secondary">
                      {t("emissions-value-co2")}
                    </FormLabel>
                    <InputGroup w="full" shadow="1dp" borderRadius={"8px"}>
                      {/* TODO translate values and use internal value for checking */}
                      <NumberInput w="full" defaultValue={0} min={0}>
                        <NumberInputField
                          data-testid="co2-emission-factor"
                          h="48px"
                          placeholder="Enter emissions value"
                          {...register("activity.CO2EmissionFactor")}
                          bgColor="base.light"
                          pos="relative"
                          zIndex={999}
                        />
                      </NumberInput>
                      <InputRightAddon
                        bgColor="base.light"
                        color="content.tertiary"
                        h="48px"
                        pos="relative"
                        zIndex={10}
                        {...register("activity.co2EmissionFactorUnit")}
                      >
                        tCO2
                      </InputRightAddon>
                    </InputGroup>
                  </FormControl>
                  <FormControl w="full">
                    <FormLabel color="content.secondary">
                      {t("emissions-value-n2o")}
                    </FormLabel>
                    <InputGroup w="full" shadow="1dp" borderRadius={"8px"}>
                      {/* TODO translate values and use internal value for checking */}
                      <NumberInput w="full" defaultValue={0} min={0}>
                        <NumberInputField
                          data-testid="n2o-emission-factor"
                          h="48px"
                          borderRightRadius={0}
                          placeholder="Enter emissions value"
                          {...register("activity.N2OEmissionFactor")}
                          bgColor="base.light"
                          pos="relative"
                          zIndex={999}
                        />
                      </NumberInput>
                      <InputRightAddon
                        bgColor="base.light"
                        color="content.tertiary"
                        borderLeft={"none"}
                        h="48px"
                        pos="relative"
                        zIndex={10}
                        {...register("activity.n2oEmissionFactorUnit")}
                      >
                        tN2O
                      </InputRightAddon>
                    </InputGroup>
                  </FormControl>
                  <FormControl w="full">
                    <FormLabel color="content.secondary">
                      {t("emissions-value-ch4")}
                    </FormLabel>
                    <InputGroup w="full" shadow="1dp" borderRadius={"8px"}>
                      {/* TODO translate values and use internal value for checking */}
                      <NumberInput w="full " defaultValue={0} min={0}>
                        <NumberInputField
                          data-testid="ch4-emission-factor"
                          h="48px"
                          borderRightRadius={0}
                          placeholder="Enter emissions value"
                          {...register("activity.CH4EmissionFactor")}
                          bgColor="base.light"
                          pos="relative"
                          zIndex={999}
                        />
                      </NumberInput>
                      <InputRightAddon
                        bgColor="base.light"
                        color="content.tertiary"
                        borderLeft={"none"}
                        h="48px"
                        pos="relative"
                        zIndex={10}
                        {...register("activity.ch4EmissionFactorUnit")}
                      >
                        tCH4
                      </InputRightAddon>
                    </InputGroup>
                  </FormControl>
                </Grid>
              )}

              <FormControl
                isInvalid={!!resolve(prefix + "dataQuality", errors)}
                mb={12}
              >
                <FormLabel>{t("data-quality")}</FormLabel>
                <Select
                  borderWidth={errors?.activity?.dataQuality ? "1px" : 0}
                  border="inputBox"
                  borderRadius="4px"
                  borderColor={
                    errors?.activity?.dataQuality
                      ? "sentiment.negativeDefault"
                      : ""
                  }
                  background={
                    errors?.activity?.dataQuality
                      ? "sentiment.negativeOverlay"
                      : ""
                  }
                  _focus={{
                    borderWidth: "1px",
                    shadow: "none",
                    borderColor: "content.link",
                  }}
                  bgColor="base.light"
                  placeholder={t("data-quality-placeholder")}
                  {...register("activity.dataQuality", {
                    required: t("option-required"),
                  })}
                  h="48px"
                  shadow="1dp"
                >
                  <option value="high">{t("detailed-activity-data")}</option>
                  <option value="medium">{t("modeled-activity-data")}</option>
                  <option value="low">
                    {t("highly-modeled-uncertain-activity-data")}
                  </option>
                </Select>
                {errors.activity?.dataQuality ? (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <WarningIcon color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">Please select data quality</Text>
                  </Box>
                ) : (
                  ""
                )}
              </FormControl>
              <FormControl
                isInvalid={!!resolve(prefix + "sourceReference", errors)}
                mb={12}
              >
                <FormLabel>{t("source-reference")}</FormLabel>
                <Textarea
                  data-testid="source-reference"
                  borderWidth={errors?.activity?.dataQuality ? "1px" : 0}
                  border="inputBox"
                  borderRadius="4px"
                  shadow="1dp"
                  h="96px"
                  borderColor={
                    errors?.activity?.dataQuality
                      ? "sentiment.negativeDefault"
                      : ""
                  }
                  background={
                    errors?.activity?.dataQuality
                      ? "sentiment.negativeOverlay"
                      : ""
                  }
                  _focus={{
                    borderWidth: "1px",
                    shadow: "none",
                    borderColor: "content.link",
                  }}
                  placeholder={t("source-reference-placeholder")}
                  {...register("activity.sourceReference", {
                    required: t("source-reference-required"),
                  })}
                />
                {errors.activity?.sourceReference ? (
                  <Box display="flex" gap="6px" alignItems="center" mt="6px">
                    <WarningIcon color="sentiment.negativeDefault" />
                    <Text fontSize="body.md">
                      Please select a source reference
                    </Text>
                  </Box>
                ) : (
                  ""
                )}
              </FormControl>
              <HStack className="items-start" mb={13}>
                <InfoOutlineIcon mt={1} color="content.link" />
                <Text color="content.tertiary">
                  All calculations consider a{" "}
                  <Text as="span" fontWeight="bold">
                    GWP value of 28 for CH4 and 265 for N20 (Version AR5).
                  </Text>
                </Text>
              </HStack>
            </form>
          </ModalBody>
          <ModalFooter
            borderTopWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
            w="full"
            display="flex"
            alignItems="center"
            p="24px"
            justifyContent="center"
          >
            <Button
              data-testid="add-emission-modal-submit"
              h="56px"
              w="full"
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              isLoading={isLoading}
              onClick={handleSubmit(onSubmit)}
              p={0}
              m={0}
            >
              {t("add-emission-data")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AddActivityModal;
