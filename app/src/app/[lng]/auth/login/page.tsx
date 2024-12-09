"use client";

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useAuthToast } from "@/hooks/useAuthToast";
import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/next-js";
import { Button, Heading, Text, useToast } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  email: string;
  password: string;
};

function VerifiedNotification({ t }: { t: TFunction }) {
  const searchParams = useSearchParams();
  const isVerified = !!searchParams.get("verification-code");
  const toast = useToast();
  useEffect(() => {
    if (isVerified) {
      toast({
        title: t("verified-toast-title"),
        description: t("verified-toast-description"),
        status: "success",
        duration: null,
        isClosable: true,
        position: "bottom-right",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerified]);

  return null;
}

export default function Login({
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
  } = useForm<Inputs>();

  const searchParams = useSearchParams();

  const [error, setError] = useState("");
  const callbackParam = searchParams.get("callbackUrl");
  let callbackUrl = `/${lng}`;
  if (
    callbackParam &&
    callbackParam !== "null" &&
    callbackParam !== "undefined"
  ) {
    callbackUrl = callbackParam;
  }
  const { showLoginSuccessToast } = useAuthToast(t);
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
        callbackUrl,
      });

      if (res?.ok) {
        showLoginSuccessToast();
        router.push(callbackUrl);
        setError("");
        return;
      }

      if (!res?.error) {
        router.push(callbackUrl);
        setError("");
      } else {
        console.error("Sign in failure:", res.error);
        setError(t("invalid-email-password"));
      }
    } catch (error: any) {
      console.error("Failed to sign in:", error);
      setError(error);
    }
  };

  return (
    <>
      <Heading size="xl">{t("login-heading")}</Heading>
      <Text my={4} color="content.tertiary">
        {t("login-details")}
      </Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <EmailInput register={register} error={errors.email} t={t} />
        <PasswordInput register={register} error={errors.password} t={t} />
        <Text color="semantic.danger">{error}</Text>
        <div className="w-full text-right">
          <Link href="/auth/forgot-password" className="underline">
            {t("forgot-password")}
          </Link>
        </div>
        <Button
          type="submit"
          formNoValidate
          isLoading={isSubmitting}
          h={16}
          width="full"
          bgColor="interactive.secondary"
        >
          {t("log-in")}
        </Button>
      </form>
      <Text
        className="w-full text-center mt-4 text-sm"
        color="content.tertiary"
      >
        {t("no-account")}{" "}
        <Link
          href={`/auth/signup?callbackUrl=${callbackUrl}`}
          className="underline"
        >
          {t("sign-up")}
        </Link>
      </Text>
      <Suspense>
        <VerifiedNotification t={t} />
      </Suspense>
    </>
  );
}
