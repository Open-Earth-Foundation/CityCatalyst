import { FC, useEffect, useState } from "react";
import { Box, Button, HStack } from "@chakra-ui/react";
import { SubmitHandler, useForm } from "react-hook-form";
import { ProfileInputs } from "@/app/[lng]/[inventory]/settings/page";
import FormInput from "../../form-input";
import EmailInput from "../../email-input";
import { useSetCurrentUserDataMutation } from "@/services/api";
import { TFunction } from "i18next";
import { UseSuccessToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { MdInfoOutline } from "react-icons/md";
import { BodyMedium } from "@/components/Texts/Body";
import { LANGUAGES, UpdateUserPayload } from "@/util/types";
import { LanguageSelector } from "@/app/[lng]/auth/signup/LanguageSelector";
import { Field } from "@/components/ui/field";

interface AccountDetailsFormProps {
  t: TFunction;
  userInfo: any;
  showTitle?: boolean;
}

const AccountDetailsTabPanel: FC<AccountDetailsFormProps> = ({
  t,
  userInfo,
  showTitle,
}) => {
  const { showSuccessToast } = UseSuccessToast({
    title: t("user-details-updated"),
    duration: 5000,
  });
  const [inputValue, setInputValue] = useState<string>("");
  const {
    handleSubmit,
    register,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInputs>();
  const [setCurrentUserData] = useSetCurrentUserDataMutation();

  useEffect(() => {
    if (userInfo) {
      setValue("name", userInfo.name);
      setValue("email", userInfo.email);
      setValue("title", userInfo.title);
      setValue("preferredLanguage", userInfo.preferredLanguage);
    }
  }, [setValue, userInfo]);

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    const payload: UpdateUserPayload = {
      userId: userInfo.userId,
      name: data.name ?? "",
      email: data.email ?? "",
      preferredLanguage: data.preferredLanguage ?? LANGUAGES.en,
    };
    if (data.title) {
      payload.title = data.title;
    }
    await setCurrentUserData(payload).then(() => showSuccessToast());
  };

  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };

  return (
    <Box
      backgroundColor="white"
      p={6}
      display="flex"
      flexDirection="column"
      gap="24px"
    >
      {!userInfo ? (
        <ProgressLoader />
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-[24px]"
        >
          <FormInput
            label={t("full-name")}
            register={register}
            error={errors.name}
            id="name"
          />
          <EmailInput
            defaultValue={userInfo.email}
            disabled
            t={t}
            register={register}
            error={errors.email}
            id="email"
          />
          {showTitle && (
            <>
              <FormInput
                label={t("position")}
                register={register}
                error={errors.title}
                id="title"
                required={false}
              />
              <HStack>
                <BodyMedium color={"content.link"}>
                  <MdInfoOutline />
                </BodyMedium>
                <BodyMedium>{t("position-description")}</BodyMedium>
              </HStack>
            </>
          )}
          <Field
            label={t("preferred-language")}
            invalid={!!errors.preferredLanguage}
            errorText={errors.preferredLanguage?.message}
          >
            <LanguageSelector
              defaultValue={userInfo.preferredLanguage}
              register={register}
              error={errors.preferredLanguage}
              t={t}
            />
          </Field>
          <Box display="flex" w="100%" justifyContent="right" marginTop="12px">
            <Button
              type="submit"
              loading={isSubmitting}
              h="48px"
              w="auto"
              paddingTop="16px"
              paddingBottom="16px"
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

export default AccountDetailsTabPanel;
