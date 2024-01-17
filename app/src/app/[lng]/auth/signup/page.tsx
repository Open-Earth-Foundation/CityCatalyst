"use client";

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import {
  Button,
  Checkbox,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { logger } from "@/services/logger";

type Inputs = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
  acceptTerms: boolean;
};

export default function Signup({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "auth");
  const router = useRouter();
  const {
    handleSubmit,
    register,
    setError: setFormError,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const [error, setError] = useState("");

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (data.password !== data.confirmPassword) {
      setFormError("confirmPassword", {
        type: "custom",
        message: "Passwords don't match!",
      });
      return;
    }

    try {
      const res = await fetch("/api/v0/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        logger.error("Failed to sign up", data);
        setError(data.error.message);
        return;
      }

      const callbackUrl = `/auth/check-email?email=${data.email}`;
      router.push(callbackUrl);

      // TODO automatic login required?
      // const loginResponse = await signIn("credentials", {
      //   redirect: false,
      //   email: data.email,
      //   password: data.password,
      //   callbackUrl,
      // });

      // if (!loginResponse?.error) {
      //   router.push(callbackUrl);
      // } else {
      //   logger.error("Failed to login", loginResponse)
      //   setError(t("invalid-email-password"));
      // }
    } catch (error: any) {
      setError(error);
    }
  };

  return (
    <>
      <Heading size="xl">{t("signup-heading")}</Heading>
      <Text mt={4} mb={8} color="content.tertiary">
        {t("signup-details")}
      </Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FormControl isInvalid={!!errors.name}>
          <FormLabel>{t("full-name")}</FormLabel>
          <Input
            type="text"
            placeholder={t("full-name-placeholder")}
            size="lg"
            {...register("name", {
              required: t("full-name-required"),
              minLength: { value: 4, message: t("min-length", { length: 4 }) },
            })}
          />
          <FormErrorMessage>
            {errors.name && errors.name.message}
          </FormErrorMessage>
        </FormControl>
        <EmailInput register={register} error={errors.email} t={t} />
        <PasswordInput register={register} error={errors.password} t={t}>
          <FormHelperText>
            <InfoOutlineIcon
              color="interactive.secondary"
              boxSize={4}
              mt={-0.5}
              mr={1.5}
            />{" "}
            {t("password-hint")}
          </FormHelperText>
        </PasswordInput>
        <PasswordInput
          register={register}
          error={errors.confirmPassword}
          t={t}
          name={t("confirm-password")}
          id="confirmPassword"
        />
        <FormControl isInvalid={!!errors.inviteCode}>
          <FormLabel>{t("invite-code")}</FormLabel>
          <Input
            type="text"
            placeholder={t("invite-code-placeholder")}
            size="lg"
            {...register("inviteCode", {
              required: t("invite-code-required"),
              minLength: { value: 6, message: t("invite-code-invalid") },
              maxLength: { value: 6, message: t("invite-code-invalid") },
            })}
          />
          <FormErrorMessage>
            {errors.inviteCode && errors.inviteCode.message}
          </FormErrorMessage>
          <FormHelperText>
            <Trans t={t} i18nKey="no-invite-code">
              Don&apos;t have an invitation code?{" "}
              <Link
                href="https://citycatalyst.openearth.org/#webflow-form"
                target="_blank"
                rel="noreferrer"
              >
                Subscribe to the Waiting List
              </Link>
            </Trans>
          </FormHelperText>
        </FormControl>
        <FormControl isInvalid={!!errors.acceptTerms}>
          <Checkbox
            color="content.tertiary"
            size="md"
            {...register("acceptTerms", {
              required: t("accept-terms-required"),
            })}
          >
            <Trans i18nKey="accept-terms" t={t}>
              Accept{" "}
              <Link href="/terms" className="underline">
                Terms and conditions
              </Link>
            </Trans>
          </Checkbox>
          <FormErrorMessage>
            {errors.acceptTerms && errors.acceptTerms.message}
          </FormErrorMessage>
        </FormControl>
        {error && <Text color="semantic.danger">{error}</Text>}
        <Button
          type="submit"
          formNoValidate
          isLoading={isSubmitting}
          h={16}
          width="full"
          bgColor="interactive.secondary"
        >
          {t("create-account")}
        </Button>
      </form>
      <Text
        className="w-full text-center mt-4 text-sm"
        color="content.tertiary"
      >
        {t("have-account")}{" "}
        <Link href="/auth/login" className="underline">
          {t("log-in")}
        </Link>
      </Text>
    </>
  );
}
