'use client'

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/next-js";
import { Button, Heading, Text, useToast } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
  email: string;
  password: string;
};

function VerifiedNotification({ t }: { t: TFunction }) {
  const searchParams = useSearchParams();
  const isVerified = !!searchParams.get('verification-code');
  const toast = useToast();
  useEffect(() => {
    if (isVerified) {
      toast({
        title: t('verified-toast-title'),
        description: t('verified-toast-description'),
        status: 'success',
        duration: null,
        isClosable: true,
        position: 'bottom-right',
      });
    }
  }, [t, toast, isVerified]);
  return null;
}

export default function Login({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'auth');
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log(data);
    setTimeout(() => {
      router.push(`/`);
    }, 2000);
  };

  return (
    <>
      <Heading size="xl">{t('login-heading')}</Heading>
      <Text my={4} color="#7A7B9A">{t('login-details')}</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <EmailInput register={register} error={errors.email} t={t} />
        <PasswordInput register={register} error={errors.password} t={t} />
        <div className="w-full text-right">
          <Link href="/forgot-password" className="underline">{t('forgot-password')}</Link>
        </div>
        <Button type="submit" formNoValidate isLoading={isSubmitting} h={16} width="full" className="bg-[#2351DC]">{t('log-in')}</Button>
      </form>
      <Text className="w-full text-center mt-4 text-sm" color="#7A7B9A">
        {t('no-account')}{' '}
        <Link href="/signup" className="underline">{t('sign-up')}</Link>
      </Text>
      <Suspense>
        <VerifiedNotification t={t} />
      </Suspense>
    </>
  );
}
