import { useEffect, useMemo } from "react";
import { Box, Button } from "@chakra-ui/react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useSetCurrentUserDataMutation } from "@/services/api";
import i18next, { TFunction } from "i18next";
import { UseSuccessToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { LANGUAGES, UpdateUserPayload, UserInfoResponse } from "@/util/types";
import { LanguageSelector } from "@/app/[lng]/auth/signup/LanguageSelector";
import { Field } from "@/components/ui/field";
import { NumberFormatEnum } from "@/util/enums";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

interface ProfileInputs {
  preferredLanguage?: string;
  numberFormat?: string;
}

const numberFormatOptions = [
  { value: NumberFormatEnum.COMMA_AND_DOT, label: "comma-and-dot" },
  { value: NumberFormatEnum.DOT_AND_COMMA, label: "dot-and-comma" },
  { value: NumberFormatEnum.SPACE_AND_COMMA, label: "space-and-comma" },
  { value: NumberFormatEnum.APOSTROPHE_AND_DOT, label: "apostrophe-and-dot" },
];
const selectableNumberFormats = new Set<string>(
  numberFormatOptions.map((option) => option.value),
);

const PreferencesTab = ({
  t,
  userInfo,
}: {
  t: TFunction;
  userInfo?: UserInfoResponse;
}) => {
  const { showSuccessToast } = UseSuccessToast({
    title: t("preferences-updated"),
    duration: 5000,
  });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInputs>();
  const [setCurrentUserData] = useSetCurrentUserDataMutation();

  // Falls back to the language currently active in the navbar (rather than
  // a hardcoded default) when the user has no saved preference yet.
  const navbarLanguage = (i18next.language as LANGUAGES) || LANGUAGES.en;
  const savedPreferredLanguage =
    (userInfo?.preferredLanguage as LANGUAGES) || navbarLanguage;
  // Treats any unset or unrecognized value (e.g. the legacy "default" enum
  // member, which is no longer offered as an option) as comma-and-dot,
  // matching how formatNumber() already resolves those values.
  const savedNumberFormat =
    userInfo?.numberFormat && selectableNumberFormats.has(userInfo.numberFormat)
      ? (userInfo.numberFormat as NumberFormatEnum)
      : NumberFormatEnum.COMMA_AND_DOT;

  useEffect(() => {
    if (userInfo) {
      setValue("preferredLanguage", savedPreferredLanguage);
      setValue("numberFormat", savedNumberFormat);
    }
  }, [setValue, userInfo, savedPreferredLanguage, savedNumberFormat]);

  const watchedPreferredLanguage = watch("preferredLanguage");
  const watchedNumberFormat = watch("numberFormat");

  const hasChanges = useMemo(
    () =>
      watchedPreferredLanguage !== savedPreferredLanguage ||
      watchedNumberFormat !== savedNumberFormat,
    [
      watchedPreferredLanguage,
      watchedNumberFormat,
      savedPreferredLanguage,
      savedNumberFormat,
    ],
  );

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    const payload: UpdateUserPayload = {
      userId: userInfo?.userId,
      preferredLanguage: data.preferredLanguage ?? LANGUAGES.en,
      numberFormat: data.numberFormat ?? NumberFormatEnum.COMMA_AND_DOT,
    };
    await setCurrentUserData(payload).then(() => showSuccessToast());
  };

  return (
    <Box
      backgroundColor="white"
      p={6}
      display="flex"
      flexDirection="column"
      gap="24px"
      borderRadius="8px"
      boxShadow="shadow-lg"
    >
      {!userInfo ? (
        <ProgressLoader />
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <Field
            label={t("preferred-language")}
            invalid={!!errors.preferredLanguage}
            errorText={errors.preferredLanguage?.message}
          >
            <LanguageSelector
              defaultValue={savedPreferredLanguage}
              register={register}
              error={errors.preferredLanguage}
              t={t}
            />
          </Field>

          {hasFeatureFlag(FeatureFlags.NUMERICAL_FORMATS) && (
            <Field
              label={t("numerical-formats")}
              invalid={!!errors.numberFormat}
              errorText={errors.numberFormat?.message}
            >
              <NativeSelectRoot
                shadow="2dp"
                borderRadius="4px"
                border="inputBox"
                background={
                  errors.numberFormat
                    ? "sentiment.negativeOverlay"
                    : "background.default"
                }
              >
                <NativeSelectField
                  {...register("numberFormat", {
                    required: t("numerical-formats-required"),
                  })}
                  defaultValue={savedNumberFormat}
                  h="44px"
                  fontSize="md"
                >
                  {numberFormatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </NativeSelectField>
              </NativeSelectRoot>
            </Field>
          )}
          <Box display="flex" w="100%" justifyContent="right" marginTop="12px">
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={!hasChanges}
              h={16}
              w="auto"
              minW="175px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
            >
              {t("save-changes")}
            </Button>
          </Box>
        </form>
      )}
    </Box>
  );
};

export default PreferencesTab;
