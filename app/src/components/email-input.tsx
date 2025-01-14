import { emailPattern } from "@/util/validation";
import { Icon, Input, Text } from "@chakra-ui/react";
import { FieldError } from "react-hook-form";
import { Fieldset } from "@chakra-ui/react";
import { Field } from "@/components/ui/field";

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
    <Fieldset.Root>
      <Field label={name} invalid={!!error} errorText={error?.message}>
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
      </Field>
    </Fieldset.Root>
  );
}
