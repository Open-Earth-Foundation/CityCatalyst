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
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: Function;
  t: Function;
  name?: String;
  id?: String;
}) {
  return (
    <FormControl isInvalid={!!error}>
      <FormLabel>{name}</FormLabel>
      <Input
        type="email"
        placeholder={t("email-placeholder")}
        size="lg"
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
