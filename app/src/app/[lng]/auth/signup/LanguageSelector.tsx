"use client";
import {
  NativeSelectRoot,
  NativeSelectField,
} from "@/components/ui/native-select";
import { LANGUAGES } from "@/util/types";

export function LanguageSelector({
  register,
  error,
  t,
  defaultValue,
}: {
  register: any;
  error: any;
  t: any;
  defaultValue: LANGUAGES;
}) {
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
        <option value={LANGUAGES.en}>English</option>
        <option value={LANGUAGES.de}>Deutsch</option>
        <option value={LANGUAGES.es}>Español</option>
        <option value={LANGUAGES.fr}>Français</option>
        <option value={LANGUAGES.pt}>Português</option>
      </NativeSelectField>
    </NativeSelectRoot>
  );
}
