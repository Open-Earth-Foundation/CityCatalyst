"use client";

import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Button, FormHelperText, Heading, Text } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { logger } from "@/services/logger";

type Inputs = {
  password: string;
  confirmPassword: string;
};

export default function UpdatePassword({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("token");
  const [error, setError] = useState("");

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setError: setFormError,
    watch
  } = useForm<Inputs>();
  const watchPassword = watch("password", "")
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
      <Heading size="xl">{t("update-password-heading")}</Heading>
      <Text className="my-4" color="#7A7B9A">
        {t("update-password-details")}
      </Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <PasswordInput
          register={register}
          error={errors.password}
          name={t("new-password")}
          t={t}
          shouldValidate
          watchPassword={watchPassword}
        >
          <FormHelperText>
            <InfoOutlineIcon color="#2351DC" mr={1.5} mt={-0.5} boxSize={4} />
            {t("password-hint")}
          </FormHelperText>
        </PasswordInput>
        <PasswordInput
          register={register}
          error={errors.confirmPassword}
          name={t("confirm-password")}
          id="confirmPassword"
          t={t}
        />
        {error && <Text color="semantic.danger">{error}</Text>}
        <Button type="submit" isLoading={isSubmitting} h={16} width="full">
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
    </>
  );
}
