"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormLabel,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Text,
} from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";
import { FieldError } from "react-hook-form";
import {
  FoodIcon,
  GardenIcon,
  IndustrialIcon,
  PaperIcon,
  TextilesIcon,
  WoodIcon,
} from "./icons";
import type { TFunction } from "i18next";

const breakdownCategories = [
  { id: "food", icon: FoodIcon },
  { id: "garden", icon: GardenIcon },
  { id: "paper", icon: PaperIcon },
  { id: "wood", icon: WoodIcon },
  { id: "textiles", icon: TextilesIcon },
  { id: "industrial", icon: IndustrialIcon },
];

interface FormInputProps {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: Function;
  id: string;
  t: TFunction;
}

const PercentageBreakdownInput: FC<FormInputProps> = ({
  label,
  isDisabled,
  error,
  register,
  id,
  t,
}) => {
  let background = "";
  if (error) {
    background = "sentiment.negativeOverlay";
  } else if (isDisabled) {
    background = "background.neutral";
  } else {
    background = "background.default";
  }

  const totalPercent = 100;
  const breakdownSummary = breakdownCategories
    .map((category) => `${t(category.id)} 10%`)
    .join(", ");

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
              <PopoverCloseButton />
              <PopoverHeader>Percentage breakdown</PopoverHeader>
              <PopoverBody w="full" className="space-y-6 py-6">
                {breakdownCategories.map((category) => (
                  <HStack key={category.id}>
                    <Icon as={category.icon} mr={4} />
                    <Text
                      fontSize="body.md"
                      fontWeight="normal"
                      letterSpacing="wide"
                      flexGrow={1}
                    >
                      {t(category.id)}
                    </Text>
                    <Input
                      type="text"
                      {...register(id + "." + category.id, { required: true })}
                      shadow="1dp"
                      name={id}
                      borderRadius="4px"
                      border="inputBox"
                      background={background}
                      color={
                        isDisabled ? "content.tertiary" : "content.secondary"
                      }
                      placeholder="10%"
                      w="116px"
                      px={4}
                      py={3}
                      borderWidth={error ? "1px" : 0}
                      borderColor={error ? "sentiment.negativeDefault" : ""}
                      bgColor="base.light"
                      _focus={{
                        borderWidth: "1px",
                        shadow: "none",
                        borderColor: "content.link",
                      }}
                    />
                  </HStack>
                ))}
                <HStack color="content.link">
                  <Text
                    flexGrow={1}
                    casing="uppercase"
                    fontSize="body.md"
                    fontWeight={700}
                    letterSpacing="wide"
                  >
                    {t("total")}
                  </Text>
                  <Text
                    fontSize="body.md"
                    fontWeight={700}
                    w="116px"
                    pl={6}
                    letterSpacing="wide"
                  >
                    {totalPercent}%
                  </Text>
                </HStack>
              </PopoverBody>
            </PopoverContent>
          </>
        )}
      </Popover>
      {error && (
        <Text
          color="sentiment.negativeDefault"
          fontFamily="heading"
          fontSize="body.md"
          fontWeight="normal"
          letterSpacing="wide"
        >
          {error.message}
        </Text>
      )}
    </FormControl>
  );
};

export default PercentageBreakdownInput;
