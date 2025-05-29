"use client";

import {
  Box,
  HStack,
  Icon,
  Stack,
  Text,
  Input,
  ColorPalette,
} from "@chakra-ui/react";
import { Radio, RadioGroup } from "@/components/ui/radio";
import React, { FC, useEffect, useMemo, useState } from "react";
import { Control, FieldError, useWatch } from "react-hook-form";
import {
  ClinicalWasteIcon,
  FoodIcon,
  GardenIcon,
  GlassWasteIcon,
  HazardousWasteIcon,
  IndustrialIcon,
  IndustrialSolidWasteIcon,
  LeatherWasteIcon,
  MetalWasteIcon,
  MunicipalSolidWasteIcon,
  NappiesWasteIcon,
  OtherWasteIcon,
  PaperIcon,
  PlasticsWasteIcon,
  SewageWasteIcon,
  TextilesIcon,
  WoodIcon,
} from "./icons";
import type { TFunction } from "i18next";
import { Field } from "./ui/field";
import { InputGroup } from "@/components/ui/input-group";
import { ValueChangeDetails } from "@zag-js/radio-group";
import FormattedNumberInput from "@/components/formatted-number-input";
import {
  NumberInputField,
  NumberInputRoot,
} from "@/components/ui/number-input";
import { MdInfoOutline } from "react-icons/md";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";

const categoryIconMapping: Record<string, any> = {
  "waste-composition-municipal-solid-waste": MunicipalSolidWasteIcon,
  "waste-composition-industrial-solid-waste": IndustrialSolidWasteIcon,
  "waste-composition-hazardous-waste": HazardousWasteIcon,
  "waste-composition-clinical-waste": ClinicalWasteIcon,
  "waste-composition-sewage-sludge": SewageWasteIcon,
  "waste-composition-food": FoodIcon,
  "waste-composition-garden": GardenIcon,
  "waste-composition-paper": PaperIcon,
  "waste-composition-wood": WoodIcon,
  "waste-composition-textiles": TextilesIcon,
  "waste-composition-industrial": IndustrialIcon,
  "waste-composition-leather": LeatherWasteIcon,
  "waste-composition-plastics": PlasticsWasteIcon,
  "waste-composition-metal": MetalWasteIcon,
  "waste-composition-glass": GlassWasteIcon,
  "waste-composition-nappies": NappiesWasteIcon,
  "waste-composition-other": OtherWasteIcon,
};

interface FormInputProps {
  label: string;
  tooltipInfo?: string;
  value?: string | null | undefined;
  control: Control<any, any>;
  isDisabled?: boolean;
  error: FieldError | undefined;
  setError: Function;
  clearErrors: Function;
  register: Function;
  getValues: Function;
  setValue: Function;
  id: string;
  t: TFunction;
  breakdownCategories: string[];
  inventoryId?: string;
  methodologyName?: string;
  defaultMode?: boolean;
}

interface CustomValueDetail extends ValueChangeDetails {
  value: "custom" | "default";
}

const PercentageBreakdownInput: FC<FormInputProps> = ({
  label,
  isDisabled,
  error,
  setError,
  clearErrors,
  getValues,
  control,
  setValue,
  id,
  t,
  breakdownCategories,
  tooltipInfo,
  inventoryId,
  methodologyName,
  defaultMode,
}) => {
  const breakDownValues: Record<string, string> = useWatch({
    control,
    name: `activity.${id}`,
    defaultValue: {},
  });

  const wasteCompositionType: string = useWatch({
    control,
    name: `activity.wasteCompositionType`,
    defaultValue: null,
  });

  let { data: wasteCompositionValues, isLoading: wasteCompositionLoading } =
    api.useGetWasteCompositionValuesQuery(
      {
        inventoryId: inventoryId as string,
        methodologyName: methodologyName as string,
      },
      {
        skip: !inventoryId || !methodologyName,
      },
    );

  useEffect(() => {
    if (wasteCompositionType === "default") {
      // If the mode is default, we want to set the breakdown values to the default values
      const initialValues = breakdownCategories.reduce(
        (acc, curr) => {
          const formulaInputValue = parseFloat(
            wasteCompositionValues?.find((val) => val.parameterName === curr)
              ?.formulaInputValue ?? "0",
          );
          acc[curr] = formulaInputValue.toString();
          return acc;
        },
        {} as Record<string, string>,
      );
      setValue(`activity.${id}`, initialValues);
    }
  }, [wasteCompositionType, wasteCompositionValues]);

  const totalPercent = useMemo(() => {
    let total = Object.values(breakDownValues).reduce<number>((acc, val) => {
      return acc + parseFloat(val || "0");
    }, 0);

    if (isNaN(total)) {
      total = 0;
    } else {
      total = Math.ceil(total); // Round to two decimal places
    }

    if (total === 100) {
      clearErrors(`activity.${id}`);
    } else if (wasteCompositionType !== null) {
      setError(`activity.${id}`, { message: "percentages-not-100" });
    }

    return total;
  }, [breakDownValues, wasteCompositionType, clearErrors, setError, id]);

  useEffect(() => {
    if (wasteCompositionType === null) {
      clearErrors();
      setError(`activity.${id}`, { message: "option-required" });
    } else {
      setValue("activity.wasteCompositionType", wasteCompositionType);
    }
  }, [wasteCompositionType, clearErrors, setError, id]);

  return (
    <Field
      display="flex"
      flexDirection="column"
      invalid={!!error}
      label={label}
      labelInfo={tooltipInfo}
    >
      {defaultMode ? (
        <RadioGroup
          w="100%"
          variant={"outline"}
          value={wasteCompositionType}
          onValueChange={(e: CustomValueDetail) =>
            setValue("activity.wasteCompositionType", e.value)
          }
        >
          <HStack
            flexDirection="column"
            alignItems="flex-start"
            mb={4}
            w="100%"
          >
            <Radio value="custom">{t("enter-custom-values")}</Radio>
            {wasteCompositionType === "custom" && (
              <Box
                w="full"
                mb={6}
                p={6}
                border={1}
                borderStyle="solid"
                borderColor="border.overlay"
                borderRadius={4}
              >
                <HStack w="full" mb={6} justifyContent="space-between">
                  <Text
                    flex={1}
                    fontSize="label.lg"
                    fontWeight="bold"
                    className="capitalize"
                  >
                    {t("categories")}
                  </Text>
                  <Text
                    w="116px"
                    fontSize="label.lg"
                    fontWeight="bold"
                    className="capitalize"
                  >
                    {t("percentage")}
                  </Text>
                </HStack>
                <HStack flexDirection="column" w="full" gap={3} mt={2}>
                  {breakdownCategories.map((category) => (
                    <HStack key={category} w="full">
                      <Icon as={categoryIconMapping[category]} />
                      <Text flex={1}>{t(category)}</Text>
                      <NumberInputRoot
                        hideWheelControls={true}
                        disabled={isDisabled}
                        outline=""
                      >
                        <InputGroup
                          addonBg="background.neutral"
                          endElement={<Text>%</Text>}
                          w="116px"
                        >
                          <NumberInputField
                            overflowX="hidden"
                            overflowY="hidden"
                            id={category}
                            name={category}
                            value={getValues(`activity.${id}.${category}`)}
                            onChange={(e) =>
                              setValue(
                                `activity.${id}.${category}`,
                                e.target.value,
                              )
                            }
                            background={isDisabled ? "gray.100" : "white"}
                            px={3}
                          />
                        </InputGroup>
                      </NumberInputRoot>
                    </HStack>
                  ))}
                </HStack>
                <HStack
                  color={
                    totalPercent === 100
                      ? "content.link"
                      : "sentiment.negativeDefault"
                  }
                  fontWeight="bold"
                  mt={6}
                >
                  <Text fontSize="title.sm" className="uppercase" flex={1}>
                    {t("total")}
                  </Text>
                  <Text fontSize="title.sm">
                    {t("waste-composition-total-percentage", {
                      percent: totalPercent,
                    })}
                  </Text>
                </HStack>
              </Box>
            )}
            <Radio value="default">{t("enter-default-values")}</Radio>
            {wasteCompositionType === "default" && (
              <>
                {wasteCompositionLoading && <ProgressLoader />}
                {wasteCompositionValues && (
                  <>
                    <Box bg="background.neutral" p={6} borderRadius={3}>
                      <HStack color="content.link">
                        <MdInfoOutline />
                        <Text
                          fontSize="label.md"
                          fontWeight="semibold"
                          color="content.link"
                        >
                          {t("waste-composition-default-values-heading")}
                        </Text>
                      </HStack>
                      <Text
                        fontSize="body.small"
                        fontWeight="normal"
                        color="content.secondary"
                      >
                        {t("waste-composition-default-values-description")}
                      </Text>
                    </Box>
                    <Box
                      w="full"
                      p={6}
                      border={1}
                      borderStyle="solid"
                      borderColor="border.overlay"
                      borderRadius={4}
                    >
                      <HStack w="full" mb={6} justifyContent="space-between">
                        <Text
                          flex={1}
                          fontSize="label.lg"
                          fontWeight="bold"
                          className="capitalize"
                        >
                          {t("categories")}
                        </Text>
                        <Text
                          w="116px"
                          fontSize="label.lg"
                          fontWeight="bold"
                          className="capitalize"
                        >
                          {t("percentage")}
                        </Text>
                      </HStack>
                      {breakdownCategories.map((category) => (
                        <HStack key={category}>
                          <Icon as={categoryIconMapping[category]} />
                          <Text flex={1}>{t(category)}</Text>
                          <Box w="116px">
                            <Text h={10}>
                              {getValues(`activity.${id}.${category}`)}%
                            </Text>
                          </Box>
                        </HStack>
                      ))}
                      <HStack
                        mt={6}
                        color={totalPercent === 100 ? "green.500" : "red.500"}
                        fontWeight="bold"
                      >
                        <Text className="uppercase" flex={1}>
                          {t("total")}
                        </Text>
                        <Text>{totalPercent}%</Text>
                      </HStack>
                    </Box>
                  </>
                )}
              </>
            )}
          </HStack>
        </RadioGroup>
      ) : (
        <Box
          w="full"
          mb={6}
          p={6}
          border={1}
          borderStyle="solid"
          borderColor="border.overlay"
          borderRadius={4}
        >
          <HStack w="full" mb={6} justifyContent="space-between">
            <Text
              flex={1}
              fontSize="label.lg"
              fontWeight="bold"
              className="capitalize"
            >
              {t("categories")}
            </Text>
            <Text
              w="116px"
              fontSize="label.lg"
              fontWeight="bold"
              className="capitalize"
            >
              {t("percentage")}
            </Text>
          </HStack>
          <HStack flexDirection="column" w="full" gap={3} mt={2}>
            {breakdownCategories.map((category) => (
              <HStack key={category} w="full">
                <Icon as={categoryIconMapping[category]} />
                <Text flex={1}>{t(category)}</Text>
                <NumberInputRoot
                  hideWheelControls={true}
                  disabled={isDisabled}
                  outline=""
                >
                  <InputGroup
                    addonBg="background.neutral"
                    endElement={<Text>%</Text>}
                    w="116px"
                  >
                    <NumberInputField
                      overflowX="hidden"
                      overflowY="hidden"
                      id={category}
                      name={category}
                      value={getValues(`activity.${id}.${category}`)}
                      onChange={(e) =>
                        setValue(`activity.${id}.${category}`, e.target.value)
                      }
                      background={isDisabled ? "gray.100" : "white"}
                      px={3}
                    />
                  </InputGroup>
                </NumberInputRoot>
              </HStack>
            ))}
          </HStack>
          <HStack
            color={
              totalPercent === 100
                ? "content.link"
                : "sentiment.negativeDefault"
            }
            fontWeight="bold"
            mt={6}
          >
            <Text fontSize="title.sm" className="uppercase" flex={1}>
              {t("total")}
            </Text>
            <Text fontSize="title.sm">
              {t("waste-composition-total-percentage", {
                percent: totalPercent,
              })}
            </Text>
          </HStack>
        </Box>
      )}
      {error?.message && (
        <Text color="sentiment.negativeDefault" fontSize="sm">
          {t(error.message)}
        </Text>
      )}
    </Field>
  );
};

export default PercentageBreakdownInput;
