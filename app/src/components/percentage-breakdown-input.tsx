"use client";

import {
  Box,
  Group,
  HStack,
  Icon,
  Input,
  InputAddon,
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
import { Field } from "./ui/field";
import {
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "./ui/popover";
import { GoChevronDown, GoChevronUp } from "react-icons/go";
import { InputGroup } from "./ui/input-group";

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
  }, [breakDownValues, breakdownCategories, t]);

  // Todo: get the popover state and implement the popover logic
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Field
      display="flex"
      flexDirection="column"
      invalid={!!error}
      label={label}
    >
      <PopoverRoot positioning={{ sameWidth: true }}>
        <PopoverTrigger asChild className="w-full">
          <Group className="w-full">
            <Field invalid={!isValid}>
              <InputGroup
                className="w-full"
                startElement={
                  <Box
                    pointerEvents="none"
                    color="content.tertiary"
                    pr="16px"
                    mt={1}
                  >
                    {isOpen ? (
                      <Icon as={GoChevronUp} boxSize="6" />
                    ) : (
                      <Icon as={GoChevronDown} boxSize="6" />
                    )}
                  </Box>
                }
              >
                <Input
                  type="text"
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
              </InputGroup>
            </Field>
          </Group>
        </PopoverTrigger>
        <PopoverContent w="full" className="overflow-scroll" portalled={false}>
          <PopoverArrow />
          <PopoverBody
            w="full"
            className="space-y-6 py-6 !pointer-events-[all]"
          >
            <>
              {breakdownCategories.map((category) => (
                <HStack key={category} pointerEvents="all">
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
                  <Group w="116px">
                    <InputAddon>%</InputAddon>
                    <Input
                      type="text"
                      value={getValues(`activity.${id}.${category}`)}
                      onChange={(e) => {
                        setValue(`activity.${id}.${category}`, e.target.value);
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
                  </Group>
                </HStack>
              ))}
              <HStack
                color={isValid ? "content.link" : "sentiment.negativeDefault"}
                fontSize="22px"
              >
                <Text
                  flexGrow={1}
                  textTransform="uppercase"
                  fontWeight={600}
                  letterSpacing="wide"
                >
                  {t("total")}
                </Text>
                <Text fontWeight={600} w="116px" pl={4} letterSpacing="wide">
                  {totalPercent as number}%
                </Text>
              </HStack>
            </>
          </PopoverBody>
        </PopoverContent>
      </PopoverRoot>
      {error?.message && <Box>{t(error.message)}</Box>}
    </Field>
  );
};

export default PercentageBreakdownInput;
