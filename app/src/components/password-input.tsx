import { Box, Icon, Text } from "@chakra-ui/react";
import { FieldError } from "react-hook-form";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import { PasswordInput as ChakraPasswordInput } from "@/components/ui/password-input";
import { IoMdEye, IoMdEyeOff } from "react-icons/io";
import LabelLarge from "@/components/package/Texts/Label";
import { isPasswordPatternValid } from "@/util/validation";

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
  isSubmitted = true,
  validate,
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: TFunction;
  name?: string;
  id?: string;
  w?: string;
  shouldValidate?: boolean;
  watchPassword?: string;
  isSubmitted?: boolean;
  validate?: (value: string) => string | boolean;
}) {
  const labelName = name || t("password");

  const passwordValid = isPasswordPatternValid(watchPassword);

  // Show hint until the password fully satisfies the pattern, only after a submit attempt
  const showHint = shouldValidate && isSubmitted && !passwordValid;

  // Same condition as showHint — whenever the hint is visible post-submit, it's invalid
  const passwordInvalid = showHint;

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
          passwordInvalid ? "sentiment.negativeDefault" : undefined
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
          required: t("please-enter-password"),
          validate,
        })}
      />

      <Box>{children}</Box>

      {/* Password pattern hint — hidden once the password is valid */}
      {showHint && (
        <Text
          fontFamily="body"
          fontSize="body.sm"
          fontWeight="regular"
          lineHeight="16px"
          color={passwordInvalid ? "fg.error" : "content.tertiary"}
        >
          {t("password-hint")}
        </Text>
      )}
    </Field>
  );
}
