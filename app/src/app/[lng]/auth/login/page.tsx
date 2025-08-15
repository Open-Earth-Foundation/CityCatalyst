"use client";

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { Box, Heading, Link, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, use } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { UseSuccessToast } from "@/hooks/Toasts";
import { Trans } from "react-i18next/TransWithoutContext";
import { logger } from "@/services/logger";
import { trackEvent, identifyUser } from "@/lib/analytics";

export type LoginInputs = {
  email: string;
  password: string;
};

function VerifiedNotification({ t }: { t: TFunction }) {
  const searchParams = useSearchParams();
  const isVerified = !!searchParams.get("verification-code");

  const { showSuccessToast } = UseSuccessToast({
    title: t("verified-toast-title"),
    description: t("verified-toast-description"),
  });

  useEffect(() => {
    if (isVerified) {
      showSuccessToast();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerified, showSuccessToast]);

  return null;
}

export default function Login(props: { params: Promise<{ lng: string }> }) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "auth");

  const router = useRouter();
  const [error, setError] = useState("");
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<LoginInputs>();

  const searchParams = useSearchParams();
  const queryParams = Object.fromEntries(searchParams.entries());
  let callbackUrl = decodeURIComponent(queryParams.callbackUrl || "");

  // only redirect to user invite page as a fallback if there is a token present in the search params
  if (!callbackUrl) {
    if (!("token" in queryParams)) {
      callbackUrl = `/`;
    }
  }

  // redirect to dashboard if user is already authenticated
  const { data: _session, status } = useSession();

  const { showSuccessToast: showLoginSuccessToast } = UseSuccessToast({
    title: t("verified-toast-title"),
    description: t("verified-toast-description"),
  });
  const onSubmit: SubmitHandler<LoginInputs> = async (data) => {
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
        callbackUrl,
      });

      if (res?.ok && !res?.error) {
        // Track successful login
        trackEvent("user_logged_in", {
          method: "credentials"
        });
        
        // Identify the user for future tracking
        identifyUser(data.email);

        showLoginSuccessToast();
        router.push(callbackUrl ?? "/");
        setError("");
        return;
      } else {
        logger.error({ err: res?.error }, "Sign in failure:");
        setError(t("invalid-email-password"));
      }
    } catch (error: any) {
      logger.error({ err: error }, "Failed to sign in:");
      setError(error);
    }
  };

  // Extract doesInvitedUserExist from callback params\
  // If it is true, redirect to /user/invites page
  // If it is false, redirect to /auth/signup page
  // Check if the callbackUrl contains a query string
  const hasQueryString = callbackUrl.includes("?");
  // Split the URL into path and query string (if query string exists)
  const [path, queryString] = hasQueryString
    ? callbackUrl.split("?")
    : [callbackUrl, ""];
  const callbackUrlParams = new URLSearchParams(queryString);
  const doesInvitedUserExist = callbackUrlParams.get("doesInvitedUserExist");

  if (doesInvitedUserExist && doesInvitedUserExist !== "true") {
    // remove the doesInvitedUserExist param from the callbackUrl
    callbackUrlParams.delete("doesInvitedUserExist");
    const updatedCallbackUrl = `${path}?${callbackUrlParams.toString()}`;
    return router.push(
      "/auth/signup/?callbackUrl=" + encodeURIComponent(updatedCallbackUrl),
    );
  }

  return (
    <Box>
      <Heading size="xl">{t("login-heading")}</Heading>
      <Text my={4} color="content.tertiary">
        {t("login-details")}
      </Text>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Box display="flex" flexDirection="column" gap="16px">
          <EmailInput register={register} error={errors.email} t={t} />
          <PasswordInput register={register} error={errors.password} t={t} />
          <Text color="semantic.danger">{error}</Text>
          <Box w="full" textAlign="right">
            <Link href="/auth/forgot-password" textDecoration="underline">
              {t("forgot-password")}
            </Link>
          </Box>
          <Button
            type="submit"
            formNoValidate
            loading={isSubmitting}
            h={16}
            width="full"
            bgColor="interactive.secondary"
          >
            {t("log-in")}
          </Button>
        </Box>
      </form>
      {callbackUrl.includes("token") && (
        <Text
          w="full"
          textAlign="center"
          mt={4}
          fontSize="sm"
          color="content.tertiary"
        >
          {t("no-account")}{" "}
          <Link
            href={`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            textDecoration="underline"
          >
            {t("sign-up")}
          </Link>
        </Text>
      )}
      <Suspense>
        <VerifiedNotification t={t} />
      </Suspense>
      <Toaster />
    </Box>
  );
}
