import { Box, Icon, Text } from "@chakra-ui/react";
import React, { useState, useEffect } from "react";
import { BiCaretDown } from "react-icons/bi";

export interface CustomSelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  options: CustomSelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: string;
  height?: string;
  t: (key: string) => string;
  label: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  width = "full",
  height = "300px",
  t,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] =
    useState<CustomSelectOption | null>(
      value ? options.find((opt) => opt.value === value) || null : null,
    );

  // Update selectedOption when value or options change
  useEffect(() => {
    if (value) {
      const foundOption = options.find((opt) => opt.value === value);
      setSelectedOption(foundOption || null);
    } else {
      setSelectedOption(null);
    }
  }, [value, options]);

  const handleSelect = (option: CustomSelectOption) => {
    setSelectedOption(option);
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <Box position="relative" w={width}>
      <Text
        as="label"
        fontSize="label.lg"
        color="content.tertiary"
        fontFamily="heading"
        fontWeight="semibold"
      >
        {t(label)}
      </Text>
      {/* Select Trigger */}
      <Box
        as="button"
        appearance="none"
        w="full"
        h="12"
        mt="2"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        px="16px"
        bg="base.light"
        fontFamily="heading"
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="4px"
        shadow="sm"
        outline="none"
        gap="8px"
        cursor="pointer"
        _hover={{
          borderColor: "content.link",
        }}
        _focus={{
          outline: "none",
          borderColor: "content.link",
          boxShadow: "0 0 0 1px content.link",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Text
          fontFamily="body"
          fontSize="md"
          fontWeight="normal"
          lineHeight="24"
          color={selectedOption ? "content.primary" : "content.tertiary"}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Icon
          as={BiCaretDown}
          color="interactive.control"
          boxSize={5}
          transition="transform 0.2s"
          transform={isOpen ? "rotate(180deg)" : "rotate(0deg)"}
        />
      </Box>

      {/* Dropdown Menu */}
      {isOpen && (
        <Box
          position="absolute"
          top="100%"
          left="0"
          right="0"
          mt="0px"
          w="full"
          bg="base.light"
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="8px"
          boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
          maxH={height}
          overflowY="auto"
          zIndex={1000}
          py="12px"
        >
          {options.map((option) => (
            <Box
              key={option.value}
              px="16px"
              display="flex"
              alignItems="center"
              h="72px"
              cursor="pointer"
              _hover={{
                bg: "content.link",
                color: "base.light",
              }}
              _selected={{
                bg: "content.link",
                color: "base.light",
              }}
              onClick={() => handleSelect(option)}
            >
              <Text fontSize="body.lg" fontWeight="medium">
                {option.label}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <Box
          position="fixed"
          top="0"
          left="0"
          right="0"
          bottom="0"
          zIndex={999}
          onClick={() => setIsOpen(false)}
        />
      )}
    </Box>
  );
};
