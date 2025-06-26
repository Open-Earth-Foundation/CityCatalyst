"use client";

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";

import { Box, Heading, Icon, Input, Link, Text } from "@chakra-ui/react";
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

type Inputs = {
  inventory?: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
  acceptTerms: boolean;
};

export default function Signup(props: { params: Promise<{ lng: string }> }) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "auth");
  const router = useRouter();

  const {
    handleSubmit,
    register,
    setError: setFormError,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<Inputs>();

  const watchPassword = watch("password", "");

  const [error, setError] = useState("");

  const searchParams = useSearchParams();
  let callbackUrl = searchParams.get("callbackUrl") ?? undefined;
  if (!callbackUrl || callbackUrl === "null" || callbackUrl === "undefined") {
    callbackUrl = undefined;
  }
  const isUserInvite = !!callbackUrl?.includes("user/invite");

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (data.password !== data.confirmPassword) {
      setFormError("confirmPassword", {
        type: "custom",
        message: "Passwords don't match!",
      });
      return;
    }

    if (isUserInvite) {
      data.inviteCode = "123456"; // TODO adjust once there is proper validation for the invite code
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

      const loginResponse = await signIn("credentials", {
        redirect: false,
        email: userData.user.email,
        password: data.password,
        callbackUrl,
      });

      if (!loginResponse?.error) {
        router.push(callbackUrl ?? "/");
      } else {
        logger.error("Failed to login", loginResponse);
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Field
          label={t("full-name")}
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
        {!isUserInvite && (
          <Field
            label={t("invite-code")}
            invalid={!!errors.inviteCode}
            errorText={
              <Box display="flex" gap="6px">
                <Icon as={MdWarning} />
                <Text
                  fontSize="body.md"
                  lineHeight="20px"
                  letterSpacing="wide"
                  color="content.tertiary"
                >
                  {errors.inviteCode?.message}
                </Text>
              </Box>
            }
          >
            <Input
              type="text"
              placeholder={t("invite-code-placeholder")}
              size="lg"
              shadow="2dp"
              background={
                errors.inviteCode
                  ? "sentiment.negativeOverlay"
                  : "background.default"
              }
              {...register("inviteCode", {
                required: t("invite-code-required"),
                minLength: { value: 6, message: t("invite-code-invalid") },
                maxLength: { value: 6, message: t("invite-code-invalid") },
              })}
            />

            <Box>
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
            </Box>
          </Field>
        )}
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
                className="underline"
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
        className="w-full text-center mt-4 text-sm"
        color="content.tertiary"
      >
        {t("have-account")}{" "}
        <Link
          href={`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl as string)}`}
          className="underline"
        >
          {t("log-in")}
        </Link>
      </Text>
    </>
  );
}
