"use client";

import { Box, HStack, Input } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

interface CreateTokenFormProps {
  t: TFunction;
  tokenName: string;
  onTokenNameChange: (value: string) => void;
  expiresIn: string;
  onExpiresInChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

/** Inline create-token form. */
export default function CreateTokenForm({
  t,
  tokenName,
  onTokenNameChange,
  expiresIn,
  onExpiresInChange,
  onCancel,
  onSubmit,
  isSubmitting = false,
}: CreateTokenFormProps) {
  return (
    <Box
      w="full"
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="8px"
      bg="background.backgroundLight"
      p="24px"
    >
      <HStack gap="24px" align="flex-start" mb="24px">
        <Field
          label={t("token-name")}
          required
          flex="1"
          labelColor="content.secondary"
        >
          <Input
            placeholder={t("token-name-placeholder")}
            value={tokenName}
            onChange={(e) => onTokenNameChange(e.target.value)}
            h="44px"
            fontSize="md"
            borderRadius="4px"
            borderColor="border.default"
            bg="base.light"
            _placeholder={{ color: "content.tertiary" }}
          />
        </Field>

        <Field label={t("expiration")} flex="1" labelColor="content.secondary">
          <NativeSelectRoot w="full">
            <NativeSelectField
              value={expiresIn}
              onChange={(e) => onExpiresInChange(e.target.value)}
              h="44px"
              fontSize="md"
              borderRadius="4px"
              borderColor="border.neutral"
              shadow="sm"
              bg="base.light"
            >
              <option value="30">30 {t("days")}</option>
              <option value="90">90 {t("days")}</option>
              <option value="365">1 {t("year")}</option>
              <option value="never">{t("never")}</option>
            </NativeSelectField>
          </NativeSelectRoot>
        </Field>
      </HStack>

      <HStack justifyContent="flex-end" gap="16px">
        <Button
          variant="outline"
          h="63px"
          minW="120px"
          onClick={onCancel}
          textTransform="uppercase"
          letterSpacing="wider"
          fontWeight="semibold"
          fontSize="button.md"
        >
          {t("cancel")}
        </Button>
        <Button
          variant="solid"
          h="63px"
          minW="160px"
          onClick={onSubmit}
          loading={isSubmitting}
          textTransform="uppercase"
          letterSpacing="wider"
          fontWeight="semibold"
          fontSize="button.md"
        >
          {t("save-changes")}
        </Button>
      </HStack>
    </Box>
  );
}
