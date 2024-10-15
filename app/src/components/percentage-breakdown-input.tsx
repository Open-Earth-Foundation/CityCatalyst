"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputRightAddon,
  InputRightElement,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
} from "@chakra-ui/react";
import React, { FC, useMemo } from "react";
import { Control, FieldError, useWatch } from "react-hook-form";
import {
  ClinicalWasteIcon,
  FoodIcon,
  GardenIcon,
  HazardousWasteIcon,
  IndustrialIcon,
  IndustrialSolidWasteIcon,
  MunicipalSolidWasteIcon,
  PaperIcon,
  SewageWasteIcon,
  TextilesIcon,
  WoodIcon,
} from "./icons";
import type { TFunction } from "i18next";

const categoryIconMapping: Record<string, any> = {
  "waste-type-municipal-solid-waste": MunicipalSolidWasteIcon,
  "waste-type-industrial": IndustrialSolidWasteIcon,
  "waste-type-hazardous": HazardousWasteIcon,
  "waste-type-clinical": ClinicalWasteIcon,
  "waste-type-sewage": SewageWasteIcon,
  "waste-composition-food": FoodIcon,
  "waste-composition-garden": GardenIcon,
  "waste-composition-paper": PaperIcon,
  "waste-composition-wood": WoodIcon,
  "waste-composition-textiles": TextilesIcon,
  "waste-composition-industrial": IndustrialIcon,
};

interface FormInputProps {
  label: string;
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
}) => {
  let background = "";
  if (error) {
    background = "sentiment.negativeOverlay";
  } else if (isDisabled) {
    background = "background.neutral";
  } else {
    background = "background.default";
  }

  const breakDownValues: Record<string, string> = useWatch({
    control,
    name: `activity.${id}`,
    defaultValue: {},
  });
  if (Object.keys(breakDownValues).length === 0) {
    setValue(
      `activity.${id}`,
      breakdownCategories.reduce(
        (acc, curr) => {
          acc[curr] = 0;
          return acc;
        },
        {} as Record<string, number>,
      ),
    );
  }

  const totalPercent = useMemo(() => {
    const total = Object.values(breakDownValues).reduce<number>(
      (acc: number, val) => acc + parseFloat(val as string),
      0,
    );
    if (total === 100) {
      clearErrors(`activity.${id}`);
    } else {
      setError(`activity.${id}`, {
        message: "percentages-not-100",
      });
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakDownValues]);
  const isValid = totalPercent === 100;
  const breakdownSummary = useMemo(() => {
    return Object.entries(breakDownValues)
      .map(([key, value]) => {
        const category = breakdownCategories.find((c) => c === key);
        return `${t(category ?? "")} ${value}%`;
      })
      .join(", ");
    // breakdownCategories
  }, [breakDownValues, t]);

  return (
    <FormControl display="flex" flexDirection="column" isInvalid={!!error}>
      <FormLabel
        variant="label"
        fontSize="label.lg"
        fontStyle="normal"
        fontWeight="medium"
        letterSpacing="wide"
      >
        {label}
      </FormLabel>
      <Popover matchWidth>
        {({ isOpen, onClose }) => (
          <>
            <PopoverTrigger>
              <InputGroup>
                <Input
                  type="text"
                  isInvalid={!isValid}
                  value={breakdownSummary}
                  shadow="1dp"
                  name={id}
                  borderRadius="4px"
                  border="inputBox"
                  background={background}
                  color={isDisabled ? "content.tertiary" : "content.secondary"}
                  h="48px"
                  bgColor="base.light"
                  _focus={{
                    borderWidth: "1px",
                    shadow: "none",
                    borderColor: "content.link",
                  }}
                />
                <InputRightElement
                  pointerEvents="none"
                  color="content.tertiary"
                  pr="16px"
                  mt={1}
                >
                  {isOpen ? (
                    <ChevronUpIcon boxSize="6" />
                  ) : (
                    <ChevronDownIcon boxSize="6" />
                  )}
                </InputRightElement>
              </InputGroup>
            </PopoverTrigger>
            <PopoverContent w="full">
              <PopoverArrow />
              <PopoverBody w="full" className="space-y-6 py-6">
                {breakdownCategories.map((category) => (
                  <HStack key={category}>
                    <Icon as={categoryIconMapping[category]} mr={4} />
                    <Text
                      fontSize="14px"
                      w="full"
                      fontWeight="normal"
                      letterSpacing="wide"
                      flexGrow={1}
                    >
                      {t(category)}
                    </Text>
                    <InputGroup w="116px">
                      <Input
                        type="text"
                        value={getValues(`activity.${id}.${category}`)}
                        onChange={(e) => {
                          setValue(
                            `activity.${id}.${category}`,
                            e.target.value,
                          );
                        }}
                        shadow="1dp"
                        name={id}
                        borderRadius="4px"
                        border="inputBox"
                        background={background}
                        color={
                          isDisabled ? "content.tertiary" : "content.secondary"
                        }
                        placeholder="0"
                        w="116px"
                        px={4}
                        py={3}
                        min={0}
                        max={100}
                        defaultValue={0}
                        borderWidth={error ? "1px" : 0}
                        borderColor={error ? "sentiment.negativeDefault" : ""}
                        bgColor="base.light"
                        _focus={{
                          borderWidth: "1px",
                          shadow: "none",
                          borderColor: "content.link",
                        }}
                      />
                      <InputRightAddon>%</InputRightAddon>
                    </InputGroup>
                  </HStack>
                ))}
                <HStack
                  color={isValid ? "content.link" : "sentiment.negativeDefault"}
                  fontSize="22px"
                >
                  <Text
                    flexGrow={1}
                    casing="uppercase"
                    fontWeight={600}
                    letterSpacing="wide"
                  >
                    {t("total")}
                  </Text>
                  <Text fontWeight={600} w="116px" pl={4} letterSpacing="wide">
                    {totalPercent as number}%
                  </Text>
                </HStack>
              </PopoverBody>
            </PopoverContent>
          </>
        )}
      </Popover>
      {error?.message && (
        <FormErrorMessage>{t(error.message)}</FormErrorMessage>
      )}
    </FormControl>
  );
};

export default PercentageBreakdownInput;
