'use client'

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/next-js";
import { Button, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
  email: string;
  password: string;
};

export default function Login({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'login');
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
      <Text my={4} color="#7A7B9A">Please enter your details to log in to your account</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <EmailInput register={register} error={errors.email} />
        <PasswordInput register={register} error={errors.password} />
        <div className="w-full text-right">
          <Link href="/forgot-password" className="underline">Forgot password</Link>
        </div>
        <Button type="submit" isLoading={isSubmitting} h={16} width="full" className="bg-[#2351DC]">Log in</Button>
      </form>
      <Text className="w-full text-center mt-4 text-sm" color="#7A7B9A">
        Don't have an account?{' '}
        <Link href="/signup" className="underline">Sign up</Link>
      </Text>
    </>
  );
}

