import { FC, useEffect, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import { SubmitHandler, useForm } from "react-hook-form";
import { ProfileInputs } from "@/app/[lng]/[inventory]/settings/page";
import FormInput from "../../form-input";
import EmailInput from "../../email-input";
import { useSetCurrentUserDataMutation } from "@/services/api";
import { TFunction } from "i18next";
import { UseSuccessToast } from "@/hooks/Toasts";
import Loading from "@/components/Loading";

interface AccountDetailsFormProps {
  t: TFunction;
  userInfo: any;
}

const AccountDetailsTabPanel: FC<AccountDetailsFormProps> = ({
  t,
  userInfo,
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
    }
  }, [setValue, userInfo]);

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    await setCurrentUserData({
      userId: userInfo.userId,
      name: data.name,
      email: data.email,
    }).then(() => showSuccessToast());
  };

  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };

  return (
    <Box display="flex" flexDirection="column" gap="24px">
      {!userInfo ? (
        <Loading />
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
