"use client";
import {
  NativeSelectRoot,
  NativeSelectField,
} from "@/components/ui/native-select";
import { LANGUAGES } from "@/util/types";
import { TFunction } from "i18next";
import { languages } from "@/i18n/settings";

export function LanguageSelector({
  register,
  error,
  t,
  defaultValue,
}: {
  register: any;
  error: any;
  t: TFunction;
  defaultValue: LANGUAGES;
}) {
  const options = languages.map((lang) => ({
    value: lang as LANGUAGES,
    label: t(`languages.${lang}`),
  }));

  return (
    <NativeSelectRoot
      shadow="2dp"
      borderRadius="4px"
      border="inputBox"
      background={error ? "sentiment.negativeOverlay" : "background.default"}
    >
      <NativeSelectField
        {...register("preferredLanguage", {
          required: t("preferred-language-required"),
        })}
        defaultValue={defaultValue}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelectField>
    </NativeSelectRoot>
  );
}
