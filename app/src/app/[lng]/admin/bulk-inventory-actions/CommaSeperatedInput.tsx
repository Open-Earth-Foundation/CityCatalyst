import { Box, Field, Icon, Input, Link, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { FieldErrors, UseFormRegister } from "react-hook-form";
import { BulkCreationInputs } from "../page";
import { TFunction } from "i18next";
import { MdInfoOutline, MdWarning } from "react-icons/md";

interface CommaSeperatedInputProps {
  errors: FieldErrors;
  register: UseFormRegister<BulkCreationInputs>;
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
}

const CommaSeperatedInput: FC<CommaSeperatedInputProps> = ({
  errors,
  register,
  t,
  field,
  inputType,
  tipContent,
}) => {
  return (
    <Field.Root invalid={!!errors[field]}>
      <Field.Label fontFamily="heading">
        {t(`${field}-input-label`)}
      </Field.Label>
      <Input
        type={inputType}
        h="56px"
        boxShadow="1dp"
        {...register(field, {
          required: t(`${field}-input-required`),
        })}
      />
      {tipContent}
      <Box>
        {errors && errors[field] && (
          <Box
            display="flex"
            gap="6px"
            alignItems="center"
            py="16px"
            color="sentiment.negativeDefault"
          >
            <MdWarning height="16px" width="16px" />
            <Text fontSize="body.md" fontStyle="normal">
              {(errors[field] as any)?.message as string}
            </Text>
          </Box>
        )}
      </Box>
    </Field.Root>
  );
};

export default CommaSeperatedInput;
