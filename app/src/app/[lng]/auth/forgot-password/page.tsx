"use client";

import EmailInput from "@/components/email-input";
import { useTranslation } from "@/i18n/client";
import { Box, Button, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useState, use } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { logger } from "@/services/logger";

type Inputs = {
  email: string;
};

export default function ForgotPassword(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "auth");
  const router = useRouter();

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();
  const [error, setError] = useState("");

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    try {
      const res = await fetch("/api/v0/auth/forgot", {
        method: "POST",
        body: JSON.stringify({ email: data.email }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        logger.error("Failed to send reset password email", data);
        setError(data.error.message);
        return;
      }

      setError("");
      router.push(`/auth/check-email?email=${data.email}&reset=true`);
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <>
      <Heading size="xl">{t("forgot-password-heading")}</Heading>
      <Text my={4} color="content.tertiary">
        {t("forgot-password-details")}
      </Text>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Box display="flex" flexDirection="column" gap="16px">
          <EmailInput register={register} error={errors.email} t={t} />
          {error && <Text color="semantic.danger">{error}</Text>}
          <Button
            type="submit"
            formNoValidate
            loading={isSubmitting}
            h={16}
            width="full"
            mt={4}
          >
            {t("reset-password")}
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
        </Box>
      </form>
    </>
  );
}
