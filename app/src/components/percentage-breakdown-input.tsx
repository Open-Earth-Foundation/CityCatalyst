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
import { InputAddon, InputGroup } from "@/components/ui/input-group";
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

const categoryDefaultCodeMapping: Record<string, string> = {
  "waste-composition-municipal-solid-waste":
    "carbon-content-municipal-solid-waste",
  "waste-composition-industrial-solid-waste":
    "carbon-content-industrial-solid-waste",
  "waste-composition-hazardous-waste": "carbon-content-hazardous-waste",
  "waste-composition-clinical-waste": "carbon-content-clinical",
  "waste-composition-sewage-sludge": "carbon-content-sewage-sludge",
  "waste-composition-food": "carbon-content-food",
  "waste-composition-garden": "carbon-content-garden",
  "waste-composition-paper": "carbon-content-paper",
  "waste-composition-wood": "carbon-content-wood",
  "waste-composition-textiles": "carbon-content-textiles",
  "waste-composition-industrial": "carbon-content-industrial",
  "waste-composition-leather": "carbon-content-leather",
  "waste-composition-plastics": "carbon-content-plastics",
  "waste-composition-metal": "carbon-content-metal",
  "waste-composition-glass": "carbon-content-glass",
  "waste-composition-nappies": "carbon-content-nappies",
  "waste-composition-other": "carbon-content-other",
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
}) => {
  const [mode, setMode] = useState<"custom" | "default" | null>(null);
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
    if (mode === "default") {
      // If the mode is default, we want to set the breakdown values to the default values
      const initialValues = breakdownCategories.reduce(
        (acc, curr) => {
          const formulaInputValue = parseFloat(
            wasteCompositionValues?.find(
              (val) => val.parameterName === categoryDefaultCodeMapping[curr],
            )?.formulaInputValue ?? "0",
          );
          acc[curr] = formulaInputValue * 100;
          return acc;
        },
        {} as Record<string, string>,
      );
      setValue(`activity.${id}`, initialValues);
    } else if (mode === "custom") {
      // If the mode is custom, we want to ensure that the breakdown values are set to empty strings
      const initialValues = breakdownCategories.reduce(
        (acc, curr) => {
          acc[curr] = "";
          return acc;
        },
        {} as Record<string, string>,
      );
      setValue(`activity.${id}`, initialValues);
    }
  }, [mode, wasteCompositionValues]);

  const breakDownValues: Record<string, string> = useWatch({
    control,
    name: `activity.${id}`,
    defaultValue: {},
  });

  React.useEffect(() => {
    if (Object.keys(breakDownValues).length === 0) {
      setValue(
        `activity.${id}`,
        breakdownCategories.reduce(
          (acc, curr) => {
            acc[curr] = "0";
            return acc;
          },
          {} as Record<string, string>,
        ),
      );
    }
  }, []);

  const totalPercent = useMemo(() => {
    const total = Object.values(breakDownValues).reduce<number>((acc, val) => {
      return acc + parseFloat(val || "0");
    }, 0);

    if (total === 100) {
      clearErrors(`activity.${id}`);
    } else if (mode !== null) {
      setError(`activity.${id}`, { message: "percentages-not-100" });
    }

    return total;
  }, [breakDownValues, mode, clearErrors, setError, id]);

  useEffect(() => {
    if (mode === null) {
      clearErrors();
      setError(`activity.${id}`, { message: "option-required" });
    }
  }, [mode, clearErrors, setError, id]);

  return (
    <Field
      display="flex"
      flexDirection="column"
      invalid={!!error}
      label={label}
      labelInfo={tooltipInfo}
    >
      <RadioGroup
        w="100%"
        variant={"outline"}
        value={mode}
        onValueChange={(e: CustomValueDetail) => setMode(e.value)}
      >
        <HStack flexDirection="column" alignItems="flex-start" mb={4} w="100%">
          <Radio value="custom">{t("enter-custom-values")}</Radio>
          {mode === "custom" && (
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
                          // Use text type to allow formatted input
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
          {mode === "default" && (
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
      {error?.message && (
        <Text color="sentiment.negativeDefault" fontSize="sm">
          {t(error.message)}
        </Text>
      )}
    </Field>
  );
};

export default PercentageBreakdownInput;
