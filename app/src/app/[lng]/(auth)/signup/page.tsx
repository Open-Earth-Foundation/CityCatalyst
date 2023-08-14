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
  confirmPassword: string;
  inviteCode: string;
  acceptTerms: boolean;
};

export default function Signup({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'auth');
  const router = useRouter();
  const { handleSubmit, register, setError, formState: { errors, isSubmitting } } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log(data);
    if (data.password !== data.confirmPassword) {
      setError('confirmPassword', { type: 'custom', message: 'Passwords don\'t match!' });
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    router.push(`/check-email?email=${data.email}`);
  };

  return (
    <>
      <Heading size="xl">{t('signup-heading')}</Heading>
      <Text mt={4} mb={8} color="#7A7B9A">{t('signup-details')}</Text>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
          <FormHelperText><InfoOutlineIcon color="#2351DC" boxSize={4} mt={-0.5} mr={1.5} />{' '}{t('password-hint')}</FormHelperText>
        </PasswordInput>
        <PasswordInput register={register} error={errors.confirmPassword} t={t} name={t('confirm-password')} id="confirmPassword" />
        <FormControl isInvalid={!!errors.inviteCode}>
          <FormLabel>{t('invite-code')}</FormLabel>
          <Input
            type="text"
            placeholder={t('invite-code-placeholder')}
            size="lg"
            {...register('inviteCode', {
              required: t('invite-code-required'),
              minLength: { value: 6, message: t('invite-code-invalid') },
              maxLength: { value: 6, message: t('invite-code-invalid') },
            })}
          />
          <FormErrorMessage>{errors.inviteCode && errors.inviteCode.message}</FormErrorMessage>
          <FormHelperText>
            <Trans t={t} i18nKey="no-invite-code">
              Don&apos;t have an invitation code? <Link href="https://openclimate.network/waiting-list" target="_blank" rel="noreferrer">Subscribe to the Waiting List</Link>
            </Trans>
          </FormHelperText>
        </FormControl>
        <FormControl isInvalid={!!errors.acceptTerms}>
          <Checkbox
            color="#7A7B9A"
            size="md"
            {...register('acceptTerms', {
              required: t('accept-terms-required'),
            })}
          >
            <Trans i18nKey="accept-terms" t={t}>
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

