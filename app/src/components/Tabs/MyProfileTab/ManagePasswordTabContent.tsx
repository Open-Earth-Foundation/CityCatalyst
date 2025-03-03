import React, { FC, useState } from "react";

import { Box, Text, VStack } from "@chakra-ui/react";
import { TitleMedium } from "@/components/Texts/Title";

import { TFunction } from "i18next";
import PasswordInput from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/services/api";
import { Toaster } from "@/components/ui/toaster";
import { UseSuccessToast } from "@/hooks/Toasts";

interface ManagePasswordProps {
  t: TFunction;
}

type Inputs = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const ManagePasswordTabContent: FC<ManagePasswordProps> = ({ t }) => {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setError: setFormError,
    watch,
    reset,
  } = useForm<Inputs>();

  const [updatePassword, { isLoading, isError, isSuccess }] =
    api.useUpdatePasswordMutation();

  const { showSuccessToast } = UseSuccessToast({
    title: t("password-updated"),
    description: t("password-updated-success"),
  });

  const watchPassword = watch("newPassword", "");
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
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
      const res: any = await updatePassword(body);
      if (res.error) {
        setError(res.error.data.error.message);
        return;
      }
      showSuccessToast();
      reset();
      setError("");
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <>
      <VStack alignItems={"space-between"} justifyContent={"space-between"}>
        <TitleMedium>{t("manage-password")}</TitleMedium>
        <Text className="my-4" color="content.tertiary">
          {t("update-password-details")}
        </Text>
      </VStack>
      <Box>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            watchPassword={watchPassword}
          />
          <PasswordInput
            register={register}
            error={errors.confirmPassword}
            name={t("confirm-password")}
            id="confirmPassword"
            t={t}
          />
          {error && <Text color="semantic.danger">{error}</Text>}
          <Button type="submit" loading={isSubmitting} h={16} width="full">
            {t("reset-button")}
          </Button>
        </form>
      </Box>
      <Toaster />
    </>
  );
};

export default ManagePasswordTabContent;
