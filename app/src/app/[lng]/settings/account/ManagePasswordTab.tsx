import { FC, useState } from "react";

import { Box, Text } from "@chakra-ui/react";
import { TitleMedium } from "@/components/package/Texts/Title";

import { TFunction } from "i18next";
import PasswordInput from "@/components/password-input";
import { PasswordStrengthMeter } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/services/api";
import { Toaster } from "@/components/ui/toaster";
import { UseSuccessToast } from "@/hooks/Toasts";
import { getApiErrorMessage } from "@/util/helpers";
import { isPasswordPatternValid } from "@/util/validation";

interface ManagePasswordProps {
  t: TFunction;
}

type Inputs = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const specialCharacters = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
function computePasswordStrength(password: string): number {
  if (password.length < 8) {
    return 0;
  }
  const additionalLength = password.length - 8;
  let strength = Math.min(Math.max(1, additionalLength / 3), 3);
  if (specialCharacters.test(password)) {
    strength += 1;
  }
  return strength;
}

const ManagePasswordTab: FC<ManagePasswordProps> = ({ t }) => {
  const [error, setError] = useState("");

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting, isValid },
    setError: setFormError,
    watch,
    reset,
  } = useForm<Inputs>({ mode: "onChange" });

  const [updatePassword] = api.useUpdatePasswordMutation();

  const { showSuccessToast } = UseSuccessToast({
    title: t("password-updated"),
    description: t("password-updated-success"),
    duration: 20000,
  });

  const watchPassword = watch("newPassword", "");
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (!isPasswordPatternValid(data.newPassword)) {
      setFormError("newPassword", {
        type: "custom",
        message: t("password-hint"),
      });
      return;
    }
    if (data.newPassword === data.currentPassword) {
      setFormError("newPassword", {
        type: "custom",
        message: t("new-password-same-as-current"),
      });
      return;
    }
    if (data.newPassword !== data.confirmPassword) {
      setFormError("confirmPassword", {
        type: "custom",
        message: t("passwords-dont-match"),
      });
      return;
    }
    const body = {
      currentPassword: data.currentPassword,
      confirmPassword: data.confirmPassword,
    };
    try {
      const res = await updatePassword(body);
      if (res.error) {
        setError(getApiErrorMessage(res.error));
        return;
      }
      showSuccessToast();
      reset();
      setError("");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    }
  };

  const newPasswordStrength = computePasswordStrength(watchPassword);

  return (
    <Box backgroundColor="white" p={6} borderRadius="8px" boxShadow="shadow-lg">
      <TitleMedium pb="36px">{t("manage-password")}</TitleMedium>
      <Box>
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <PasswordInput
            register={register}
            error={errors.currentPassword}
            name={t("current-password")}
            id="currentPassword"
            t={t}
          />
          <PasswordInput
            register={register}
            error={errors.newPassword}
            name={t("new-password")}
            t={t}
            id="newPassword"
            shouldValidate
            liveValidate={false}
            watchPassword={watchPassword}
          />
          <PasswordStrengthMeter value={newPasswordStrength} />
          <PasswordInput
            register={register}
            error={errors.confirmPassword}
            name={t("confirm-password")}
            id="confirmPassword"
            t={t}
          />
          {error && <Text color="semantic.danger">{error}</Text>}
          <Box display="flex" w="100%" justifyContent="right" marginTop="12px">
            <Button
              type="submit"
              loading={isSubmitting}
              h={16}
              minW="175px"
              disabled={!isValid}
            >
              {t("reset-button")}
            </Button>
          </Box>
        </form>
      </Box>
      <Toaster />
    </Box>
  );
};

export default ManagePasswordTab;
