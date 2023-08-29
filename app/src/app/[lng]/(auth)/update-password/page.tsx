"use client";

import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Button, FormHelperText, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";

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
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    if (data.password !== data.confirmPassword) {
      setError("confirmPassword", {
        type: "custom",
        message: "Passwords don't match!",
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    router.push(`/reset-successful`);
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
          name="New Password"
          t={t}
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
