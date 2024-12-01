import { emailPattern } from "@/util/validation";
import { WarningIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Text,
} from "@chakra-ui/react";
import { FieldError } from "react-hook-form";

export default function EmailInput({
  children,
  error,
  register,
  t,
  name = t("email-address"),
  id = "email",
  disabled = false,
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: Function;
  name?: String;
  id?: String;
  disabled?: boolean;
}) {
  return (
    <FormControl isInvalid={!!error}>
      <FormLabel>{name}</FormLabel>
      <Input
        readOnly={disabled}
        type="email"
        placeholder={t("email-placeholder")}
        size="lg"
        shadow="2dp"
        background={
          error
            ? "sentiment.negativeOverlay"
            : disabled
              ? "background.neutral"
              : "background.default"
        }
        {...register(id, {
          required: t("email-required"),
          pattern: {
            value: emailPattern,
            message: t("email-invalid"),
          },
        })}
      />
      {children}
      {error && (
        <FormErrorMessage display="flex" gap="6px">
          <WarningIcon />
          <Text
            fontSize="body.md"
            lineHeight="20px"
            letterSpacing="wide"
            color="content.tertiary"
          >
            {error.message}
          </Text>
        </FormErrorMessage>
      )}
    </FormControl>
  );
}
