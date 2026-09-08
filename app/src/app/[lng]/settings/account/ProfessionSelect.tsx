import { FieldError, UseFormRegister } from "react-hook-form";
import { TFunction } from "i18next";

import { Field } from "@/components/ui/field";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";

const professionOptions = [
  { value: "oef_admin", label: "profession-oef-admin" },
  { value: "city_official", label: "profession-city-official" },
  {
    value: "network_representative",
    label: "profession-network-representative",
  },
  { value: "consultant", label: "profession-consultant" },
  {
    value: "non_city_government_official",
    label: "profession-non-city-government-official",
  },
  { value: "other", label: "profession-other" },
] as const;

interface ProfessionSelectProps {
  t: TFunction;
  register: UseFormRegister<{ title?: string | null }>;
  error?: FieldError;
  defaultValue?: string | null;
  /** When false, hides the Open Earth Foundation Admin option */
  showOefAdminOption?: boolean;
}

export function ProfessionSelect({
  t,
  register,
  error,
  defaultValue,
  showOefAdminOption = false,
}: ProfessionSelectProps) {
  const options = showOefAdminOption
    ? professionOptions
    : professionOptions.filter((option) => option.value !== "oef_admin");
  return (
    <Field
      label={t("profession")}
      invalid={!!error}
      errorText={error?.message}
    >
      <NativeSelectRoot
        shadow="2dp"
        borderRadius="4px"
        border="inputBox"
        background={error ? "sentiment.negativeOverlay" : "background.default"}
        size="lg"
      >
        <NativeSelectField
          {...register("title")}
          defaultValue={defaultValue ?? ""}
        >
          <option value="">{t("select-a-profession")}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </NativeSelectField>
      </NativeSelectRoot>
    </Field>
  );
}
