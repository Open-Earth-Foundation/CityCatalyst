import { Box, Icon, Text } from "@chakra-ui/react";
import {
  FieldError,
  FieldValues,
  Path,
  UseFormRegister,
} from "react-hook-form";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import { PasswordInput as ChakraPasswordInput } from "@/components/ui/password-input";
import { IoMdEye, IoMdEyeOff } from "react-icons/io";
import LabelLarge from "@/components/package/Texts/Label";
import { isPasswordPatternValid } from "@/util/validation";

export default function PasswordInput<
  TFieldValues extends FieldValues = FieldValues,
>({
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
  register: UseFormRegister<TFieldValues>;
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

  // Hint is always visible as guidance; it's only styled as an error once
  // the user has attempted to submit and the password still doesn't match.
  const showHint = shouldValidate && !passwordValid;
  const passwordInvalid = shouldValidate && isSubmitted && !passwordValid;

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
        {...register(id as Path<TFieldValues>, {
          required: t("please-enter-password"),
          validate,
        })}
      />

      <Box>{children}</Box>

      {/* Password pattern hint — hidden once the password is valid */}
      {showHint && (
        <Text
          mt="s"
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
