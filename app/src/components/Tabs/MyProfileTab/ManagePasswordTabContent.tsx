import React, { FC, useEffect, useState } from "react";

import {
  Box,
  Center,
  ProgressCircle,
  HStack,
  Input,
  Select,
  Icon,
  createListCollection,
  Text,
  VStack,
} from "@chakra-ui/react";

import { MdInfoOutline, MdSearch } from "react-icons/md";
import { TitleMedium } from "@/components/Texts/Title";

import { TFunction } from "i18next";
import PasswordInput from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { logger } from "@/services/logger";
import { useRouter, useSearchParams } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";
import { Field } from "@/components/ui/field";

interface ManagePasswordProps {
  t: TFunction;
}

type Inputs = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const ManagePasswordTabContent: FC<ManagePasswordProps> = ({ t }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("token");
  const [error, setError] = useState("");

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setError: setFormError,
    watch,
  } = useForm<Inputs>();
  const watchPassword = watch("newPassword", "");
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      setFormError("confirmPassword", {
        type: "custom",
        message: "Passwords don't match!",
      });
      return;
    }
    const body = {
      current: data.currentPassword,
      newPassword: data.currentPassword,
      confirmPassword: data.confirmPassword,
    };
    try {
      console.log(body);
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
          <Field>
            <PasswordInput
              register={register}
              error={errors.newPassword}
              name={t("new-password")}
              t={t}
              id="newPassword"
              shouldValidate
              watchPassword={watchPassword}
            />
          </Field>
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
    </>
  );
};

export default ManagePasswordTabContent;
