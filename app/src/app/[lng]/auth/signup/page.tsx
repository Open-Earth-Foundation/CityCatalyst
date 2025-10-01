"use client";

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";

import { Box, Heading, Icon, Input, Link, Text } from "@chakra-ui/react";
import LabelLarge from "@/components/Texts/Label";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, use } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { logger } from "@/services/logger";
import { MdWarning } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { signIn } from "next-auth/react";
import { LANGUAGES } from "@/util/types";
import { LanguageSelector } from "./LanguageSelector";
import i18next from "i18next";
import { trackEvent, identifyUser } from "@/lib/analytics";
import { hasFeatureFlag } from "@/util/feature-flags";
import { FeatureFlags } from "@/util/feature-flags";
import { getHomePath } from "@/util/routes";

type Inputs = {
  inventory?: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  preferredLanguage: LANGUAGES;
};

export default function Signup(props: { params: Promise<{ lng: string }> }) {
  const lng = i18next.language as LANGUAGES;
  const { t } = useTranslation(lng, "auth");
  const router = useRouter();

  const {
    handleSubmit,
    register,
    setError: setFormError,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<Inputs>({
    defaultValues: {
      preferredLanguage: lng as LANGUAGES,
    },
  });

  const watchPassword = watch("password", "");

  const [error, setError] = useState("");

  const searchParams = useSearchParams();
  let callbackUrl = searchParams.get("callbackUrl") ?? undefined;
  if (!callbackUrl || callbackUrl === "null" || callbackUrl === "undefined") {
    callbackUrl = undefined;
  }

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (data.password !== data.confirmPassword) {
      setFormError("confirmPassword", {
        type: "custom",
        message: "Passwords don't match!",
      });
      return;
    }

    if (typeof data.acceptTerms !== "boolean") {
      data.acceptTerms = data.acceptTerms === "on";
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
        let message = data.error.message;
        if (message === "Entity exists already.") {
          message = t("user-exists-already");
        }
        setError(message);
        return;
      }
      // can be re-enabled once the email verification required again
      // const queryParamsString = new URLSearchParams(queryParams).toString();
      // const callbackParam = callbackUrl ? "&" : "";
      // const nextCallbackUrl = `/auth/check-email?email_address=${data.email}${callbackParam}${queryParamsString}`;
      // router.push(nextCallbackUrl);
      // automatic login after signup for simplified user flow
      const userData = (await res.json()) as any;

      // Track user registration
      trackEvent("user_registered", {
        preferred_language: data.preferredLanguage,
      });

      const loginResponse = await signIn("credentials", {
        redirect: false,
        email: userData.user.email,
        password: data.password,
        callbackUrl,
      });

      if (!loginResponse?.error) {
        // Identify the user for future tracking with additional properties
        identifyUser(userData.user.email, {
          name: userData.user.name,
          preferredLanguage: userData.user.preferredLanguage,
          role: userData.user.role,
          email: userData.user.email,
        });
        router.push(callbackUrl ?? getHomePath(lng));
      } else {
        logger.error(loginResponse, "Failed to login");
        setError(t("invalid-email-password"));
      }
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ gap: "16px", display: "flex", flexDirection: "column" }}
      >
        <Field
          label={<LabelLarge>{t("full-name")}</LabelLarge>}
          invalid={!!errors.name}
          errorText={
            <Box display="flex" gap="6px">
              <Icon as={MdWarning} />
              <Text
                fontSize="body.md"
                lineHeight="20px"
                letterSpacing="wide"
                color="content.tertiary"
              >
                {errors.name?.message}
              </Text>
            </Box>
          }
        >
          <Input
            type="text"
            placeholder={t("full-name-placeholder")}
            background={
              errors.name ? "sentiment.negativeOverlay" : "background.default"
            }
            shadow="2dp"
            size="lg"
            {...register("name", {
              required: t("full-name-required"),
              minLength: { value: 4, message: t("min-length", { length: 4 }) },
            })}
          />
        </Field>
        <EmailInput register={register} error={errors.email} t={t} />
        <PasswordInput
          register={register}
          error={errors.password}
          shouldValidate={true}
          t={t}
          watchPassword={watchPassword}
        />
        <PasswordInput
          register={register}
          error={errors.confirmPassword}
          t={t}
          name={t("confirm-password")}
          id="confirmPassword"
          shouldValidate={false}
        />
        <Field
          label={<LabelLarge>{t("preferred-language")}</LabelLarge>}
          invalid={!!errors.preferredLanguage}
          errorText={
            <Box display="flex" gap="6px">
              <Icon as={MdWarning} />
              <Text
                fontSize="body.md"
                lineHeight="20px"
                letterSpacing="wide"
                color="content.tertiary"
              >
                {errors.preferredLanguage?.message}
              </Text>
            </Box>
          }
        >
          <LanguageSelector
            register={register}
            error={errors.preferredLanguage}
            t={t}
            defaultValue={lng as LANGUAGES}
          />
        </Field>
        <Field
          invalid={!!errors.acceptTerms}
          errorText={
            <Box display="flex" gap="6px">
              <Icon as={MdWarning} />
              <Text
                fontSize="body.md"
                lineHeight="20px"
                letterSpacing="wide"
                color="content.tertiary"
              >
                {errors.acceptTerms?.message}
              </Text>
            </Box>
          }
        >
          <Checkbox
            color="content.tertiary"
            size="md"
            {...register("acceptTerms", {
              required: t("accept-policy-required"),
            })}
          >
            <Trans i18nKey="accept-privacy-policy" t={t}>
              Accept the{" "}
              <Link
                href="https://citycatalyst.openearth.org/privacy"
                textDecoration="underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Policy
              </Link>
            </Trans>
          </Checkbox>
        </Field>
        {error && <Text color="semantic.danger">{error}</Text>}
        <Button
          type="submit"
          formNoValidate
          loading={isSubmitting}
          h={16}
          width="full"
          bgColor="interactive.secondary"
        >
          {t("create-account")}
        </Button>
      </form>
      <Text
        w="full"
        textAlign="center"
        mt={4}
        fontSize="sm"
        color="content.tertiary"
      >
        {t("have-account")}{" "}
        <Link
          href={`/auth/login?callbackUrl=${encodeURIComponent(`${callbackUrl ?? ""}&from=signup`)}`}
          textDecoration="underline"
        >
          {t("log-in")}
        </Link>
      </Text>
    </>
  );
}
