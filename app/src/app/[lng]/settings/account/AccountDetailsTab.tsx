import { FC, useEffect } from "react";
import { Box, Button } from "@chakra-ui/react";
import { SubmitHandler, useForm } from "react-hook-form";
import FormInput from "@/components/form-input";
import EmailInput from "@/components/email-input";
import { useSetCurrentUserDataMutation } from "@/services/api";
import { TFunction } from "i18next";
import { UseSuccessToast } from "@/hooks/Toasts";
import ProgressLoader from "@/components/ProgressLoader";
import { Roles, UpdateUserPayload, UserInfoResponse } from "@/util/types";
import { ProfessionSelect } from "./ProfessionSelect";

interface AccountDetailsFormProps {
  t: TFunction;
  userInfo?: UserInfoResponse;
  showTitle?: boolean;
}

interface ProfileInputs {
  name: string;
  email?: string;
  city: string;
  role: string;
  locode: string;
  userId: string;
  title?: string | null;
}

const AccountDetailsTab: FC<AccountDetailsFormProps> = ({
  t,
  userInfo,
  showTitle,
}) => {
  const { showSuccessToast } = UseSuccessToast({
    title: t("user-details-updated"),
    duration: 5000,
  });
  const {
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileInputs>();
  const [setCurrentUserData] = useSetCurrentUserDataMutation();

  useEffect(() => {
    if (userInfo) {
      reset({
        name: userInfo.name,
        email: userInfo.email,
        title: userInfo.title ?? "",
      });
    }
  }, [reset, userInfo]);

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    const payload: UpdateUserPayload = {
      userId: userInfo?.userId,
      name: data.name ?? "",
      email: data.email ?? "",
    };
    if (data.title) {
      payload.title = data.title;
    }
    await setCurrentUserData(payload).then(() => {
      showSuccessToast();
      reset({
        name: data.name,
        email: data.email,
        title: data.title ?? "",
      });
    });
  };

  return (
    <Box
      p={6}
      display="flex"
      flexDirection="column"
      gap="24px"
      borderRadius="8px"
      boxShadow="shadow-lg"
      backgroundColor="white"
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
            <ProfessionSelect
              t={t}
              register={register}
              error={errors.title}
              defaultValue={userInfo.title}
              showOefAdminOption={userInfo.role === Roles.Admin}
            />
          )}
          <Box display="flex" w="100%" justifyContent="right" marginTop="12px">
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={!isDirty}
              py="28px"
              w="auto"
              minW="175px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
            >
              {t("save-changes")}
            </Button>
          </Box>
        </form>
      )}
    </Box>
  );
};

export default AccountDetailsTab;
