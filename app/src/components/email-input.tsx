import { emailPattern } from "@/util/validation";
import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
} from "@chakra-ui/react";
import { FieldError } from "react-hook-form";

export default function EmailInput({
  children,
  error,
  register,
  t,
  name = t("email-address"),
  id = "email",
  disabled,
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: Function;
  name?: String;
  id?: String;
  disabled: boolean;
}) {
  return (
    <FormControl isInvalid={!!error}>
      <FormLabel>{name}</FormLabel>
      <Input
        readOnly={disabled}
        type="email"
        placeholder={t("email-placeholder")}
        size="lg"
        background={disabled ? "background.neutral" : "background.default"}
        {...register(id, {
          required: t("email-required"),
          pattern: {
            value: emailPattern,
            message: t("email-invalid"),
          },
        })}
      />
      {children}
      <FormErrorMessage>{error && error.message}</FormErrorMessage>
    </FormControl>
  );
}
