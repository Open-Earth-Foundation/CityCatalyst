import { emailPattern } from "@/util/validation";
import { Input } from "@chakra-ui/react";
import { FieldError } from "react-hook-form";
import { Field } from "@/components/ui/field";
import LabelLarge from "@/components/package/Texts/Label";

export default function EmailInput({
  children,
  error,
  register,
  t,
  name = t("email-address"),
  id = "email",
  disabled = false,
  defaultValue = "",
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: (
    name: string,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
  t: (key: string) => string;
  name?: string;
  id?: string;
  disabled?: boolean;
  defaultValue?: string;
}) {
  return (
    <Field
      label={<LabelLarge>{name}</LabelLarge>}
      invalid={!!error}
      errorText={error?.message}
    >
      <Input
        readOnly={disabled}
        type="email"
        placeholder={t("email-placeholder")}
        defaultValue={defaultValue}
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
  );
}
