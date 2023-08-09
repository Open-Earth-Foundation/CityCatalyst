'use client'

import EmailInput from "@/components/email-input";
import { useTranslation } from "@/i18n/client";
import { Button, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  email: string;
};

export default function ForgotPassword({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'auth');
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    router.push(`/check-email?email=${data.email}&reset=true`);
  };

  return (
    <>
      <Heading size="xl">{t('forgot-password-heading')}</Heading>
      <Text my={4} color="#7A7B9A">{t('forgot-password-details')}</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <EmailInput register={register} error={errors.email} t={t} />
        <Button type="submit" formNoValidate isLoading={isSubmitting} h={16} width="full" mt={4}>
          {t('reset-password')}
        </Button>
        <Button type="reset" disabled={isSubmitting} variant="ghost" h={16} width="full" mt={4} onClick={() => router.back()}>
          {t('cancel')}
        </Button>
      </form>
    </>
  );
}

