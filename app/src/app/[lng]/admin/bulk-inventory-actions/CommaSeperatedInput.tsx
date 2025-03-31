import { Box, Field, Icon, Input, Link, Tag, Text } from "@chakra-ui/react";
import React, { FC, useState } from "react";
import {
  ControllerFieldState,
  FieldErrors,
  UseFormRegister,
} from "react-hook-form";
import { BulkCreationInputs } from "../page";
import { TFunction } from "i18next";
import { MdInfoOutline, MdWarning } from "react-icons/md";

interface CommaSeperatedInputProps {
  errors: ControllerFieldState["error"];
  t: TFunction;
  field:
    | "cities"
    | "years"
    | "emails"
    | "inventoryGoal"
    | "globalWarmingPotential"
    | "connectSources";
  inputType: string;
  tipContent: React.ReactNode;
  initialValues?: any[];
  onChange: (values: any) => void;
}

const CommaSeperatedInput: FC<CommaSeperatedInputProps> = ({
  errors,
  t,
  field,
  inputType,
  tipContent,
  initialValues = [],
  onChange,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [items, setItems] = useState<string[]>(initialValues);

  const addItem = (value: string) => {
    if (value && !items.includes(value)) {
      const newItems = [...items, value];
      setItems(newItems);
      onChange(newItems);
    }
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    onChange(newItems);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addItem(inputValue.trim());
      setInputValue("");
    }
  };
  return (
    <Field.Root invalid={!!errors && initialValues.length === 0}>
      <Field.Label fontFamily="heading">
        {t(`${field}-input-label`)}
      </Field.Label>
      <Input
        type={inputType}
        h="56px"
        boxShadow="1dp"
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        value={inputValue}
      />
      {tipContent}
      <Box mt={2} display="flex" flexWrap="wrap" gap={2}>
        {items?.map((item, index) => (
          <Tag.Root
            key={index}
            size="md"
            borderRadius="16px"
            p="6px"
            px="20px"
            variant="solid"
            bg="background.neutral"
            color="content.alternative"
            display="flex"
            justifyContent="center"
          >
            <Tag.Label fontWeight="400">{item}</Tag.Label>
            <Tag.EndElement color="interactive.control">
              <Tag.CloseTrigger
                onClick={() => removeItem(index)}
                boxSize={6}
                mt="-6px"
              />
            </Tag.EndElement>
          </Tag.Root>
        ))}
      </Box>
      <Box>
        {errors && (
          <Box
            display="flex"
            gap="6px"
            alignItems="center"
            py="16px"
            color="sentiment.negativeDefault"
          >
            <MdWarning height="16px" width="16px" />
            <Text fontSize="body.md" fontStyle="normal">
              {(errors as any)?.message as string}
            </Text>
          </Box>
        )}
      </Box>
    </Field.Root>
  );
};

export default CommaSeperatedInput;
