'use client'

import EmailInput from "@/components/email-input";
import PasswordInput from "@/components/password-input";
import { useTranslation } from "@/i18n/client";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Button, Checkbox, FormControl, FormErrorMessage, FormHelperText, FormLabel, Heading, Input, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";

type Inputs = {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
};

export default function Signup({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'register');
  const router = useRouter();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    router.push(`/check-email?email=${data.email}`);
  };

  return (
    <>
      <Heading size="xl">{t('signup-heading')}</Heading>
      <Text className="my-4" color="#7A7B9A">{t('signup-details')}</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormControl isInvalid={!!errors.name}>
          <FormLabel>{t('full-name')}</FormLabel>
          <Input
            type="text"
            placeholder={t('full-name-placeholder')}
            size="lg"
            {...register('name', {
              required: t('full-name-required'),
              minLength: { value: 4, message: t('min-length', { length: 4 }) },
            })}
          />
          <FormErrorMessage>{errors.name && errors.name.message}</FormErrorMessage>
        </FormControl>
        <EmailInput register={register} error={errors.email} t={t} />
        <PasswordInput register={register} error={errors.password} t={t}>
          <FormHelperText><InfoOutlineIcon color="#2351DC" />{' '}{t('password-hint')}</FormHelperText>
        </PasswordInput>
        <FormControl isInvalid={!!errors.acceptTerms}>
          <Checkbox
            color="#7A7B9A"
            size="md"
            {...register('acceptTerms', {
              required: t('accept-terms-required'),
            })}
          >
            <Trans i18nKey="accept-terms">
              Accept <Link href="/terms" className="underline">Terms and conditions</Link>
            </Trans>
          </Checkbox>
          <FormErrorMessage>
            {errors.acceptTerms && errors.acceptTerms.message}
          </FormErrorMessage>
        </FormControl>
        <Button type="submit" formNoValidate isLoading={isSubmitting} h={16} width="full" className="bg-[#2351DC]">{t('create-account')}</Button>
      </form>
      <Text className="w-full text-center mt-4 text-sm" color="#7A7B9A">
        {t('have-account')}{' '}
        <Link href="/login" className="underline">{t('log-in')}</Link>
      </Text>
    </>
  );
}
