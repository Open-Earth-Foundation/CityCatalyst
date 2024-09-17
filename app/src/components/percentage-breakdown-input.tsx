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
import { Row } from "@react-email/components";
import React, { FC, useEffect, useState } from "react";
import { FieldError } from "react-hook-form";
import { FoodIcon } from "./icons";

interface FormInputProps {
  label: string;
  value?: string | null | undefined;
  isDisabled?: boolean;
  error: FieldError | undefined;
  register: Function;
  id: string;
}

const PercentageBreakdownInput: FC<FormInputProps> = ({
  label,
  value,
  isDisabled,
  error,
  register,
  id,
}) => {
  const [inputValue, setInputValue] = useState<string | undefined | null>(
    value,
  );

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };
  let background = "";
  if (error) {
    background = "sentiment.negativeOverlay";
  } else if (isDisabled) {
    background = "background.neutral";
  } else {
    background = "background.default";
  }

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
                  shadow="1dp"
                  name={id}
                  borderRadius="4px"
                  border="inputBox"
                  background={background}
                  color={isDisabled ? "content.tertiary" : "content.secondary"}
                  placeholder={label}
                  isReadOnly={true}
                  h="48px"
                  borderWidth={error ? "1px" : 0}
                  borderColor={error ? "sentiment.negativeDefault" : ""}
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
                >
                  {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </InputRightElement>
              </InputGroup>
            </PopoverTrigger>
            <PopoverContent w="full">
              <PopoverArrow />
              <PopoverCloseButton />
              <PopoverHeader>Percentage breakdown</PopoverHeader>
              <PopoverBody w="full">
                <HStack>
                  <Icon as={FoodIcon} mr={4} />
                  <Text
                    fontSize="body.md"
                    fontWeight="normal"
                    letterSpacing="wide"
                    flexGrow={1}
                  >
                    {label}
                  </Text>
                  <Input
                    type="text"
                    shadow="1dp"
                    name={id}
                    borderRadius="4px"
                    border="inputBox"
                    background={background}
                    color={
                      isDisabled ? "content.tertiary" : "content.secondary"
                    }
                    placeholder="10%"
                    value={inputValue ?? ""}
                    onChange={onInputChange}
                    minW={16}
                    maxW={32}
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
