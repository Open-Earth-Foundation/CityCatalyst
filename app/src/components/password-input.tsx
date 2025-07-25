import { Box, Icon, List, ListIndicator, Text } from "@chakra-ui/react";
import { FieldError } from "react-hook-form";
import { CheckListIcon, CloseListIcon } from "./icons";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import { PasswordInput as ChakraPasswordInput } from "@/components/ui/password-input";
import { IoMdEye, IoMdEyeOff } from "react-icons/io";
import LabelLarge from "@/components/Texts/Label";

export default function PasswordInput({
  children,
  error,
  register,
  t,
  name = "Password",
  id = "password",
  w,
  shouldValidate = false,
  watchPassword = "",
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: TFunction;
  name?: String;
  id?: String;
  w?: string;
  shouldValidate?: boolean;
  watchPassword?: string;
}) {
  // Password checks
  const password = watchPassword || "";
  const hasLowercase = /[a-z]/.test(password);
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);

  return (
    <Field
      invalid={!!error}
      label={<LabelLarge>{name}</LabelLarge>}
      errorText={error?.message}
      w={w}
    >
      <ChakraPasswordInput
        size="lg"
        w="full"
        shadow="2dp"
        placeholder={t("password")}
        background={error ? "sentiment.negativeOverlay" : "background.default"}
        visibilityIcon={{
          on: (
            <Icon as={IoMdEyeOff} color="content.tertiary" boxSize={6} mr={2} />
          ),
          off: (
            <Icon as={IoMdEye} color="content.tertiary" boxSize={6} mr={2} />
          ),
        }}
        {...register(id, {
          required: t("password-required"),
          minLength: { value: 4, message: t("min-length", { length: 4 }) },
          pattern: shouldValidate
            ? {
                hasMinLength: (value: string) =>
                  value.length >= 8 || t("password-min-length"),
                hasUpperCase: (value: string) =>
                  /[A-Z]/.test(value) || t("password-upper-case"),
                hasLowerCase: (value: string) =>
                  /[a-z]/.test(value) || t("password-lower-case"),
                hasNumber: (value: string) =>
                  /[0-9]/.test(value) || t("password-number"),
              }
            : undefined,
        })}
      />

      <Box>{children}</Box>
      {/* Password Checklist */}
      {shouldValidate && (
        <List.Root gap={1} mt={2}>
          <List.Item display="flex" alignItems="center" gap="6px">
            <List.Indicator
              color={
                hasMinLength
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            >
              {hasMinLength ? <CheckListIcon /> : <CloseListIcon />}
            </List.Indicator>
            <Text
              color={
                hasMinLength ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-min-length-check", { length: 8 })}
            </Text>
          </List.Item>
          <List.Item display="flex" alignItems="center" gap="6px">
            <List.Indicator
              color={
                hasUppercase
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            >
              {hasUppercase ? <CheckListIcon /> : <CloseListIcon />}
            </List.Indicator>
            <Text
              color={
                hasUppercase ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-upper-case-check")}
            </Text>
          </List.Item>
          <List.Item display="flex" alignItems="center" gap="6px">
            <ListIndicator
              color={
                hasLowercase
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            >
              {hasLowercase ? <CheckListIcon /> : <CloseListIcon />}
            </ListIndicator>
            <Text
              color={
                hasLowercase ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-lower-case-check")}
            </Text>
          </List.Item>
          <List.Item display="flex" alignItems="center" gap="6px">
            <List.Indicator
              color={
                hasNumber
                  ? "sentiment.positiveDefault"
                  : "sentiment.negativeDefault"
              }
            >
              {hasNumber ? <CheckListIcon /> : <CloseListIcon />}
            </List.Indicator>
            <Text
              color={
                hasNumber ? "content.tertiary" : "sentiment.negativeDefault"
              }
              fontSize="body.md"
              letterSpacing="wide"
            >
              {t("password-number-check")}
            </Text>
          </List.Item>
        </List.Root>
      )}
    </Field>
  );
}
