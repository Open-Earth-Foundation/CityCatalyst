import { emailPattern } from "@/util/validation";
import { Input } from "@chakra-ui/react";
import {
  FieldError,
  FieldValues,
  Path,
  UseFormRegister,
} from "react-hook-form";
import type { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import LabelLarge from "@/components/package/Texts/Label";

export default function EmailInput<TFieldValues extends FieldValues>({
  children,
  error,
  register,
  t,
  name = t("email-address"),
  id = "email" as Path<TFieldValues>,
  disabled = false,
  defaultValue = "",
}: {
  children?: React.ReactNode;
  error: FieldError | undefined;
  register: UseFormRegister<TFieldValues>;
  t: TFunction;
  name?: string;
  id?: Path<TFieldValues>;
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
