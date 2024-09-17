"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormLabel,
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
      <Popover>
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
            <PopoverContent>
              <PopoverArrow />
              <PopoverCloseButton />
              <PopoverHeader>Confirmation!</PopoverHeader>
              <PopoverBody>
                Are you sure you want to have that milkshake?
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
