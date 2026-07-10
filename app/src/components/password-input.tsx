import { Box, Icon, Text } from "@chakra-ui/react";
import { FieldError } from "react-hook-form";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import { PasswordInput as ChakraPasswordInput } from "@/components/ui/password-input";
import { IoMdEye, IoMdEyeOff } from "react-icons/io";
import LabelLarge from "@/components/package/Texts/Label";
import { BiInfoCircle } from "react-icons/bi";

export default function PasswordInput({
  children,
  error,
  register,
  t,
  name,
  id = "password",
  w,
  shouldValidate = false,
  watchPassword = "",
  mismatch = false,
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
  mismatch?: boolean;
}) {
  const labelName = name || t("password");

  const passwordInvalid =
    shouldValidate &&
    watchPassword.length > 0 &&
    (watchPassword.length < 8 ||
      !/[A-Z]/.test(watchPassword) ||
      !/[a-z]/.test(watchPassword) ||
      !/[0-9]/.test(watchPassword));

  const passwordValid =
    shouldValidate &&
    watchPassword.length >= 8 &&
    /[A-Z]/.test(watchPassword) &&
    /[a-z]/.test(watchPassword) &&
    /[0-9]/.test(watchPassword);

  // Show hint until the password fully satisfies the pattern
  const showHint = shouldValidate && !passwordValid;

  return (
    <Field
      invalid={!!error}
      label={<LabelLarge>{labelName}</LabelLarge>}
      errorText={error?.message}
      w={w}
    >
      <ChakraPasswordInput
        size="lg"
        w="full"
        shadow="2dp"
        placeholder={t("password")}
        background={error ? "sentiment.negativeOverlay" : "background.default"}
        borderColor={
          passwordInvalid || mismatch ? "sentiment.negativeDefault" : undefined
        }
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

      {/* Password pattern hint — hidden once the password is valid */}
      {showHint && (
        <Box display="flex" alignItems="flex-start" gap={2} mt={2}>
          <Icon
            as={BiInfoCircle}
            color={passwordInvalid ? "sentiment.negativeDefault" : "content.tertiary"}
            boxSize={4}
            mt="2px"
          />
          <Text
            fontSize="body.md"
            color={passwordInvalid ? "sentiment.negativeDefault" : "content.tertiary"}
            letterSpacing="wide"
            fontFamily="body"
          >
            {t("password-hint")}
          </Text>
        </Box>
      )}

      {/* Passwords mismatch error — hidden when Field already shows a form error */}
      {mismatch && !error && (
        <Text
          fontSize="body.md"
          color="sentiment.negativeDefault"
          letterSpacing="wide"
          mt={2}
        >
          {t("passwords-dont-match")}
        </Text>
      )}
    </Field>
  );
}
