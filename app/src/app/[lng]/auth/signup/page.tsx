"use client";

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";

import { Heading, Input, Link, Text } from "@chakra-ui/react";
import LabelLarge from "@/components/package/Texts/Label";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { logger } from "@/services/logger";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { signIn } from "next-auth/react";
import { LANGUAGES } from "@/util/types";
import i18next from "i18next";
import { trackEvent, identifyUser } from "@/lib/analytics";
import { getHomePath } from "@/util/routes";
import { getApiErrorMessage } from "@/util/helpers";

type Inputs = {
  inventory?: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  preferredLanguage: LANGUAGES;
};


const normalizeInviteEmail = (value: string | null): string =>
  (value ?? "").replaceAll(" ", "+");

export default function Signup() {
  const lng = i18next.language as LANGUAGES;
  const { t } = useTranslation(lng, "auth");
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbackUrlParam = searchParams.get("callbackUrl");
  const decodedCallbackUrl = callbackUrlParam
    ? decodeURIComponent(callbackUrlParam)
    : "";
  const callbackUrlSearch = decodedCallbackUrl.includes("?")
    ? decodedCallbackUrl.split("?")[1]
    : "";
  const callbackParams = new URLSearchParams(callbackUrlSearch);
  const prefilledEmail =
    normalizeInviteEmail(searchParams.get("email")) ||
    normalizeInviteEmail(callbackParams.get("email"));

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting, isSubmitted },
    watch,
  } = useForm<Inputs>({
    defaultValues: {
      preferredLanguage: lng,
      email: prefilledEmail,
    },
  });

  const watchPassword = watch("password", "");

  const [error, setError] = useState("");

  let callbackUrl = searchParams.get("callbackUrl") ?? undefined;
  if (!callbackUrl || callbackUrl === "null" || callbackUrl === "undefined") {
    callbackUrl = undefined;
  }

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (typeof data.acceptTerms !== "boolean") {
      data.acceptTerms = data.acceptTerms === "on";
    }
    try {
      const res = await fetch("/api/v1/auth/register", {
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
      const userData = (await res.json()) as {
        user: {
          email: string;
          name?: string;
          preferredLanguage?: string;
          role?: string;
        };
      };

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
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, "Something went wrong"));
    }
  };

  return (
    <>
      <Heading
        fontFamily="Poppins"
        fontSize="display.sm"
        fontWeight={600}
        lineHeight="44px"
        color="content.secondary"
      >
        {t("signup-heading")}
      </Heading>
      <Text mt={4} mb={8} color="content.tertiary">
        {t("signup-details")}
      </Text>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        style={{ gap: "16px", display: "flex", flexDirection: "column" }}
      >
        <Field
          label={<LabelLarge>{t("full-name")}</LabelLarge>}
          invalid={!!errors.name}
          errorText={errors.name?.message}
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
        <PasswordInput
          register={register}
          error={errors.password}
          shouldValidate={true}
          t={t}
          watchPassword={watchPassword}
          isSubmitted={isSubmitted}
        />
        <PasswordInput
          register={register}
          error={errors.confirmPassword}
          t={t}
          name={t("confirm-password")}
          id="confirmPassword"
          shouldValidate={false}
          isSubmitted={isSubmitted}
          validate={(value) => value === watchPassword || t("passwords-dont-match")}
        />
        <EmailInput
          register={register}
          error={errors.email}
          t={t}
          disabled={Boolean(prefilledEmail)}
          defaultValue={prefilledEmail}
        />
        <input type="hidden" {...register("preferredLanguage")} />
        <Field
          mt="s"
          invalid={!!errors.acceptTerms}
          errorText={errors.acceptTerms?.message}
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
          disabled={isSubmitting}
          mt="s"
          h={16}
          width="full"
          bgColor="interactive.secondary"
          color="white"
          _disabled={{ color: "white" }}
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
          href={`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl ?? "")}`}
          textDecoration="underline"
        >
          {t("log-in")}
        </Link>
      </Text>
    </>
  );
}
