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
  password: string;
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
  const watchPassword = watch("password", "");
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (data.password !== data.confirmPassword) {
      setFormError("confirmPassword", {
        type: "custom",
        message: "Passwords don't match!",
      });
      return;
    }
    const body = { newPassword: data.password, resetToken };
    try {
      const res = await fetch("/api/v0/auth/password", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        logger.error("Failed to reset password", data);
        setError(data.error.message);
        return;
      }

      setError("");
      router.push(`/auth/reset-successful`);
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
          <Field>
            <PasswordInput
              register={register}
              error={errors.password}
              name={t("current-password")}
              t={t}
              shouldValidate
              watchPassword={watchPassword}
            ></PasswordInput>
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
          <Button
            type="reset"
            disabled={isSubmitting}
            variant="ghost"
            h={16}
            width="full"
            mt={4}
            onClick={() => router.back()}
          >
            {t("cancel")}
          </Button>
        </form>
      </Box>
    </>
  );
};

export default ManagePasswordTabContent;
